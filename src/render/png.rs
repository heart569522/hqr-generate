use crate::core::types::{QrBitmap, QrModules};
use crate::error::GenerateError;

/// Clear pixel range `[start, end)` in a 1-bit PNG scanline.
/// 1-bit grayscale: bit 7 is the leftmost pixel, 0 is black.
#[inline]
fn clear_range_1bit(row: &mut [u8], start: u32, end: u32) {
    if start >= end {
        return;
    }
    let start = start as usize;
    let end = end as usize;
    let first = start / 8;
    let last = (end - 1) / 8;

    if first == last {
        let head = start % 8;
        let tail_bits = end - (last * 8); // 1..=8
        let bits = tail_bits - head;
        let shift = 8 - head - bits;
        let mask = (((1u16 << bits) - 1) as u8) << shift;
        row[first] &= !mask;
        return;
    }

    let head = start % 8;
    if head == 0 {
        row[first] = 0;
    } else {
        let mask = (1u8 << (8 - head)) - 1;
        row[first] &= !mask;
    }

    row[first + 1..last].fill(0);

    let tail = end - last * 8;
    if tail == 8 {
        row[last] = 0;
    } else {
        let shift = 8 - tail;
        let mask = ((1u8 << tail) - 1) << shift;
        row[last] &= !mask;
    }
}

/// Fast path: rasterize modules straight into a 1-bit PNG buffer.
///
/// ~8x less input for deflate than 8-bit grayscale, so both the encode and the
/// resulting file are substantially smaller. No intermediate pixel buffer is
/// allocated.
pub fn render_png_modules(m: &QrModules) -> Result<Vec<u8>, GenerateError> {
    let img_size = m.img_size;
    let stride = img_size.div_ceil(8) as usize;
    let h = img_size as usize;

    // Start all-white (0xFF), then clear bits for dark modules.
    let mut buf = vec![0xFFu8; stride * h];

    let scale = m.scale;
    let n = m.n;
    let origin = m.origin_px();

    for y in 0..n {
        let py0 = (origin + y * scale) as usize;
        let py1 = py0 + scale as usize;

        // Merge horizontal runs of dark modules into one bit-clear per row.
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
            let px0 = origin + start * scale;
            let px1 = px0 + run * scale;

            for row in py0..py1 {
                let row_slice = &mut buf[row * stride..(row + 1) * stride];
                clear_range_1bit(row_slice, px0, px1);
            }
        }
    }

    let est = 256 + buf.len() / 2;
    let mut out = Vec::with_capacity(est);
    {
        let mut encoder = png::Encoder::new(&mut out, img_size, img_size);
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

/// Legacy 8-bit grayscale path, for callers still going through [`QrBitmap`].
pub fn render_png(bitmap: &QrBitmap) -> Result<Vec<u8>, GenerateError> {
    let est = 256 + bitmap.pixels.len() / 4;
    let mut out = Vec::with_capacity(est);

    {
        let mut encoder = png::Encoder::new(&mut out, bitmap.width, bitmap.height);
        encoder.set_color(png::ColorType::Grayscale);
        encoder.set_depth(png::BitDepth::Eight);
        encoder.set_filter(png::Filter::NoFilter);
        encoder.set_compression(png::Compression::Fast);

        let mut writer = encoder
            .write_header()
            .map_err(|e| GenerateError::Png(e.to_string()))?;
        writer
            .write_image_data(&bitmap.pixels)
            .map_err(|e| GenerateError::Png(e.to_string()))?;
    }

    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::generate::generate_qr_modules;
    use crate::core::types::{GenerateOptions, SizeMode};

    /// Reference implementation: clear one bit at a time.
    fn clear_naive(row: &mut [u8], start: u32, end: u32) {
        for px in start..end {
            let byte = (px / 8) as usize;
            let bit = 7 - (px % 8);
            row[byte] &= !(1 << bit);
        }
    }

    #[test]
    fn bit_clearing_matches_the_naive_version() {
        for start in 0..24u32 {
            for end in start..40u32 {
                let mut fast = [0xFFu8; 5];
                let mut naive = [0xFFu8; 5];
                clear_range_1bit(&mut fast, start, end);
                clear_naive(&mut naive, start, end);
                assert_eq!(fast, naive, "mismatch for range {start}..{end}");
            }
        }
    }

    #[test]
    fn png_header_reports_the_requested_dimensions() {
        let m = generate_qr_modules(
            "https://example.com",
            GenerateOptions {
                size: 320,
                size_mode: SizeMode::Exact,
                ..Default::default()
            },
        )
        .unwrap();
        let bytes = render_png_modules(&m).unwrap();

        assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n");
        // IHDR payload starts at byte 16: width then height, big-endian u32.
        let w = u32::from_be_bytes(bytes[16..20].try_into().unwrap());
        let h = u32::from_be_bytes(bytes[20..24].try_into().unwrap());
        assert_eq!((w, h), (320, 320));
        assert_eq!(bytes[24], 1, "expected 1-bit depth");
        assert_eq!(bytes[25], 0, "expected grayscale colour type");
    }

    #[test]
    fn one_bit_output_is_much_smaller_than_the_legacy_eight_bit_path() {
        let m = generate_qr_modules("https://example.com/a/b/c?d=e", GenerateOptions::default())
            .unwrap();
        let small = render_png_modules(&m).unwrap();
        let legacy = render_png(&crate::core::generate::rasterize(&m)).unwrap();
        assert!(
            small.len() < legacy.len(),
            "1-bit {} vs 8-bit {}",
            small.len(),
            legacy.len()
        );
    }
}
