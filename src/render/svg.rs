use core::fmt::Write;

use crate::core::types::{QrBitmap, QrModules};

/// Render SVG straight from the module grid: O(n^2) over modules (~29^2), not
/// over scaled pixels (~400^2). Adjacent dark modules on a row are merged into
/// one subpath, and every subpath is placed with a relative `m` command so the
/// `d` attribute stays compact.
pub fn render_svg_modules(m: &QrModules) -> String {
    render_svg_modules_with_logo(m, None)
}

/// Escape a string for use inside a double-quoted XML attribute.
///
/// Logo hrefs are caller-supplied — usually a `data:` URI, but not always — and
/// they land directly in the markup. Left unescaped, an `&` alone is enough to
/// produce an SVG no parser will accept.
fn escape_attr(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 16);
    for ch in value.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(ch),
        }
    }
    out
}

/// As [`render_svg_modules`], but drops `logo_href` into the centre square that
/// [`crate::core::types::GenerateOptions::logo_space`] blanked out.
///
/// The image is fitted inside that square with `xMidYMid meet`, so a
/// non-square logo is letterboxed rather than stretched over live modules.
pub fn render_svg_modules_with_logo(m: &QrModules, logo_href: Option<&str>) -> String {
    let img = m.img_size;

    // Rough capacity: header + ~12 bytes per dark run in the path `d`.
    let est = 256 + (m.n * m.n) as usize * 6;
    let mut out = String::with_capacity(est);

    let _ = write!(
        out,
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="{0}" height="{0}" viewBox="0 0 {0} {0}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path fill="black" d=""#,
        img
    );

    let n = m.n;
    let scale = m.scale;
    let origin = m.origin_px();

    let mut cx: i64 = 0;
    let mut cy: i64 = 0;
    for y in 0..n {
        let py = (origin + y * scale) as i64;
        let mut x = 0;
        while x < n {
            if !m.is_dark(x, y) {
                x += 1;
                continue;
            }
            let start = x;
            x += 1;
            while x < n && m.is_dark(x, y) {
                x += 1;
            }
            let run = x - start;
            let px = (origin + start * scale) as i64;
            let w = (run * scale) as i64;

            // Relative move from the current pen position, then a closed rect.
            let _ = write!(out, "m{} {}h{}v{}h-{}z", px - cx, py - cy, w, scale, w);
            // `z` returns the pen to the subpath start (px, py) — the new cursor.
            cx = px;
            cy = py;
        }
    }

    out.push_str(r#""/>"#);

    if let (Some(href), Some((lx, ly, side))) = (logo_href, m.logo_rect_px()) {
        let _ = write!(
            out,
            r#"<image href="{}" x="{}" y="{}" width="{}" height="{}" preserveAspectRatio="xMidYMid meet"/>"#,
            escape_attr(href),
            lx,
            ly,
            side,
            side
        );
    }

    out.push_str("</svg>");
    out
}

/// Legacy API: render SVG from a rasterized bitmap. Prefer [`render_svg_modules`].
pub fn render_svg(bitmap: &QrBitmap) -> String {
    let size = bitmap.width;
    let est = 256 + bitmap.pixels.len() / 4;
    let mut out = String::with_capacity(est);

    let _ = write!(
        out,
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="{0}" height="{0}" viewBox="0 0 {0} {0}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/>"#,
        size
    );

    let w = bitmap.width as usize;
    for y in 0..bitmap.height as usize {
        let row = &bitmap.pixels[y * w..(y + 1) * w];
        let mut x = 0;
        while x < w {
            if row[x] != 0 {
                x += 1;
                continue;
            }
            let start = x;
            x += 1;
            while x < w && row[x] == 0 {
                x += 1;
            }
            let _ = write!(
                out,
                r#"<rect x="{}" y="{}" width="{}" height="1" fill="black"/>"#,
                start,
                y,
                x - start
            );
        }
    }

    out.push_str("</svg>");
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::generate::generate_qr_modules;
    use crate::core::types::{GenerateOptions, SizeMode};

    #[test]
    fn svg_declares_the_requested_size() {
        let m = generate_qr_modules(
            "https://example.com",
            GenerateOptions {
                size: 512,
                size_mode: SizeMode::Exact,
                ..Default::default()
            },
        )
        .unwrap();
        let svg = render_svg_modules(&m);

        assert!(svg.starts_with("<svg "));
        assert!(svg.ends_with("</svg>"));
        assert!(svg.contains(r#"width="512" height="512""#));
        assert!(svg.contains(r#"viewBox="0 0 512 512""#));
    }

    #[test]
    fn path_geometry_stays_inside_the_viewbox() {
        let m = generate_qr_modules("https://example.com/x", GenerateOptions::default()).unwrap();
        let svg = render_svg_modules(&m);

        // First absolute pen position: the first `m dx dy` starts from (0, 0).
        let d = svg.split(r#"d=""#).nth(1).unwrap();
        let first = d.split('m').nth(1).unwrap();
        let (dx, rest) = first.split_once(' ').unwrap();
        let dy: i64 = rest
            .split(|c: char| !c.is_ascii_digit() && c != '-')
            .next()
            .unwrap()
            .parse()
            .unwrap();
        let dx: i64 = dx.parse().unwrap();

        assert!(
            dx >= m.origin_px() as i64,
            "first run starts inside the quiet zone"
        );
        assert!(dy >= m.origin_px() as i64);
    }

    #[test]
    fn logo_is_placed_over_the_blanked_square() {
        use crate::core::types::Ecc;
        let m = generate_qr_modules(
            "https://example.com/logo",
            GenerateOptions {
                ecc: Ecc::H,
                logo_space: 25,
                size: 400,
                ..Default::default()
            },
        )
        .unwrap();

        let (x, y, side) = m.logo_rect_px().unwrap();
        let svg = render_svg_modules_with_logo(&m, Some("data:image/png;base64,AAAA"));

        assert!(svg.contains(&format!(
            r#"x="{x}" y="{y}" width="{side}" height="{side}""#
        )));
        assert!(svg.ends_with("</svg>"));
        // The <image> must come after the <path>, or the modules paint over it.
        assert!(svg.find("<image").unwrap() > svg.find("<path").unwrap());
    }

    #[test]
    fn logo_href_is_escaped() {
        use crate::core::types::Ecc;
        let m = generate_qr_modules(
            "https://example.com/logo",
            GenerateOptions {
                ecc: Ecc::H,
                logo_space: 25,
                ..Default::default()
            },
        )
        .unwrap();

        let svg = render_svg_modules_with_logo(&m, Some(r#"/logo.svg?a=1&b=2"><script/>"#));
        assert!(svg.contains("&amp;b=2"), "ampersand must be escaped");
        assert!(
            !svg.contains("<script"),
            "attribute must not break out of the quote"
        );
    }

    #[test]
    fn no_logo_href_emits_no_image_element() {
        let m = generate_qr_modules("plain", GenerateOptions::default()).unwrap();
        let svg = render_svg_modules_with_logo(&m, Some("data:image/png;base64,AAAA"));
        assert!(!svg.contains("<image"), "no reserved space means no logo");
    }

    #[test]
    fn run_merging_beats_one_rect_per_module() {
        let m = generate_qr_modules("https://example.com/a/b/c?d=e", GenerateOptions::default())
            .unwrap();
        let compact = render_svg_modules(&m);
        let legacy = render_svg(&crate::core::generate::rasterize(&m));
        assert!(
            compact.len() * 10 < legacy.len(),
            "path {} vs rects {}",
            compact.len(),
            legacy.len()
        );
    }
}
