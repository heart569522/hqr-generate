//! Rasterize a 1D barcode.
//!
//! Simpler than the QR path: one row of bars stretched to a height, rather than
//! a grid. The same rules still apply — whole pixels per module, runs merged
//! before they reach the encoder.
#![cfg(feature = "barcode")]

use core::fmt::Write;

use crate::core::barcode::BarcodeModules;
use crate::error::GenerateError;

/// Height of the human-readable row, relative to the module width.
fn text_height(m: &BarcodeModules) -> u32 {
    (m.module_width * 6).clamp(10, 64)
}

/// Merge adjacent bars into `(start_module, run_length)` pairs.
fn runs(bars: &[bool]) -> impl Iterator<Item = (u32, u32)> + '_ {
    let mut i = 0usize;
    core::iter::from_fn(move || {
        while i < bars.len() && !bars[i] {
            i += 1;
        }
        if i >= bars.len() {
            return None;
        }
        let start = i;
        while i < bars.len() && bars[i] {
            i += 1;
        }
        Some((start as u32, (i - start) as u32))
    })
}

/// Encode the barcode as a 1-bit grayscale PNG.
///
/// The human-readable digits are *not* drawn: rendering text means carrying a
/// font, and a font is far larger than everything else in this crate put
/// together. Use the SVG renderer when the text matters, or composite it
/// yourself over the returned bytes.
pub fn render_barcode_png(m: &BarcodeModules) -> Result<Vec<u8>, GenerateError> {
    let width = m.img_width();
    let height = m.height;
    let stride = width.div_ceil(8) as usize;

    let mut buf = vec![0xFFu8; stride * height as usize];
    let origin = m.origin_px();

    // Every scanline is identical, so build one and copy it down.
    let mut row = vec![0xFFu8; stride];
    for (start, len) in runs(&m.bars) {
        let px0 = origin + start * m.module_width;
        let px1 = px0 + len * m.module_width;
        crate::render::png::clear_range_1bit(&mut row, px0, px1);
    }
    for y in 0..height as usize {
        buf[y * stride..(y + 1) * stride].copy_from_slice(&row);
    }

    let mut out = Vec::with_capacity(256 + buf.len() / 2);
    {
        let mut encoder = png::Encoder::new(&mut out, width, height);
        encoder.set_color(png::ColorType::Grayscale);
        encoder.set_depth(png::BitDepth::One);
        encoder.set_filter(png::Filter::NoFilter);
        encoder.set_compression(png::Compression::Fast);

        let mut writer = encoder
            .write_header()
            .map_err(|e| GenerateError::Png(e.to_string()))?;
        writer
            .write_image_data(&buf)
            .map_err(|e| GenerateError::Png(e.to_string()))?;
    }
    Ok(out)
}

/// Render the barcode as SVG, optionally with the data printed underneath.
///
/// Text is a `<text>` element rather than paths, so it costs nothing in binary
/// size and stays selectable and crisp at any zoom.
pub fn render_barcode_svg(m: &BarcodeModules, show_text: bool) -> String {
    let width = m.img_width();
    let text_h = if show_text { text_height(m) } else { 0 };
    let height = m.height + text_h;

    let mut out = String::with_capacity(256 + m.bars.len() * 24);
    let _ = write!(
        out,
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path fill="black" d=""#
    );

    let origin = m.origin_px();
    let mut cx: i64 = 0;
    for (start, len) in runs(&m.bars) {
        let px = (origin + start * m.module_width) as i64;
        let w = (len * m.module_width) as i64;
        // Relative move from the pen, then a closed rect — same trick the QR
        // renderer uses to keep `d` short.
        let _ = write!(out, "m{} 0h{}v{}h-{}z", px - cx, w, m.height, w);
        cx = px;
    }
    out.push_str(r#""/>"#);

    if show_text && !m.text.is_empty() {
        let font = (text_h * 3 / 4).max(8);
        let _ = write!(
            out,
            r#"<text x="{}" y="{}" font-family="monospace" font-size="{}" text-anchor="middle" fill="black" letter-spacing="{}">{}</text>"#,
            width / 2,
            m.height + font,
            font,
            m.module_width.max(1),
            escape_text(&m.text),
        );
    }

    out.push_str("</svg>");
    out
}

fn escape_text(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            _ => out.push(ch),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::barcode::{BarcodeOptions, Symbology, generate_barcode_modules};

    fn code128(text: &str) -> BarcodeModules {
        generate_barcode_modules(text, Symbology::Code128, BarcodeOptions::default()).unwrap()
    }

    #[test]
    fn png_dimensions_follow_the_data_and_the_options() {
        let m = code128("HELLO");
        let bytes = render_barcode_png(&m).unwrap();

        assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n");
        let w = u32::from_be_bytes(bytes[16..20].try_into().unwrap());
        let h = u32::from_be_bytes(bytes[20..24].try_into().unwrap());
        assert_eq!(w, m.img_width());
        assert_eq!(h, m.height, "height comes from the options, not the data");
        assert_eq!(bytes[24], 1, "1-bit depth");
    }

    #[test]
    fn svg_grows_only_when_the_text_is_drawn() {
        let m =
            generate_barcode_modules("012345678901", Symbology::Ean13, BarcodeOptions::default())
                .unwrap();

        let bare = render_barcode_svg(&m, false);
        let titled = render_barcode_svg(&m, true);

        assert!(bare.contains(&format!(r#"height="{}""#, m.height)));
        assert!(!bare.contains("<text"));
        assert!(titled.contains("<text"));
        assert!(titled.len() > bare.len());
        // The computed check digit has to appear under the bars.
        assert!(
            titled.contains("0123456789012"),
            "printed text must include the check digit"
        );
    }

    #[test]
    fn runs_are_merged_rather_than_emitted_per_module() {
        let m = code128("HELLO WORLD");
        let svg = render_barcode_svg(&m, false);
        let subpaths = svg.matches('m').count();
        let bars = m.bars.iter().filter(|b| **b).count();
        assert!(
            subpaths < bars,
            "{subpaths} subpaths for {bars} bar modules"
        );
    }

    #[test]
    fn text_is_escaped() {
        // Code 128 covers printable ASCII, so it is the one that can carry
        // characters the markup would otherwise choke on.
        let m = code128("A&B<C>");
        let svg = render_barcode_svg(&m, true);
        assert!(svg.contains("A&amp;B&lt;C&gt;"), "text was not escaped");
        assert!(!svg.contains("<C>"), "raw markup leaked into the document");
    }

    #[test]
    fn data_the_symbology_cannot_represent_is_a_typed_error() {
        // Code 39 has no lowercase and no ampersand.
        let err = generate_barcode_modules("a&b", Symbology::Code39, BarcodeOptions::default())
            .unwrap_err();
        assert_eq!(err.code(), "INVALID_BARCODE_DATA");
        assert!(
            err.to_string().contains("code39"),
            "message should name the symbology"
        );
    }
}
