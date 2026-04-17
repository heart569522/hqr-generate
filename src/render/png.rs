use crate::core::types::{QrBitmap, QrModules};
use crate::error::GenerateError;

/// Clear pixel range `[start, end)` in a PNG 1-bit scanline.
/// 1-bit grayscale: bit 7 = leftmost pixel, 0 = black.
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

    for b in (first + 1)..last {
        row[b] = 0;
    }

    let tail = end - last * 8;
    if tail == 8 {
        row[last] = 0;
    } else {
        let shift = 8 - tail;
        let mask = (((1u8 << tail) - 1)) << shift;
        row[last] &= !mask;
    }
}

/// Fast path: rasterize modules straight into a 1-bit PNG buffer.
/// ~8× smaller input to deflate vs. 8-bit grayscale → substantially faster encode
/// and smaller output.
pub fn render_png_modules(m: &QrModules) -> Result<Vec<u8>, GenerateError> {
    let img_size = m.img_size();
    let stride = ((img_size + 7) / 8) as usize;
    let h = img_size as usize;

    // Start all-white (0xFF), then clear bits for dark modules.
    let mut buf = vec![0xFFu8; stride * h];

    let scale = m.scale;
    let margin = m.margin;
    let n = m.n;

    for y in 0..n {
        let py0 = ((y + margin) * scale) as usize;
        let py1 = py0 + scale as usize;

        // Compute one row's mask pattern once, then replicate across the scale block.
        // We do it row-by-row to keep code simple; runs make this cheap anyway.
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
            let px0 = (start + margin) * scale;
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
        encoder.set_filter(png::FilterType::NoFilter);
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

/// Legacy 8-bit grayscale path, kept for any caller still going through `QrBitmap`.
pub fn render_png(bitmap: &QrBitmap) -> Result<Vec<u8>, GenerateError> {
    let est = 256 + bitmap.pixels.len() / 4;
    let mut out = Vec::with_capacity(est);

    {
        let mut encoder = png::Encoder::new(&mut out, bitmap.width, bitmap.height);
        encoder.set_color(png::ColorType::Grayscale);
        encoder.set_depth(png::BitDepth::Eight);
        encoder.set_filter(png::FilterType::NoFilter);
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
