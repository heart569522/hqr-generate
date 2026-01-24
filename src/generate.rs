use qrcode::types::Color;
use qrcode::{EcLevel, QrCode};

use crate::error::GenerateError;

#[inline]
fn ecc_from_u8(ecc: u8) -> EcLevel {
    match ecc {
        0 => EcLevel::L,
        1 => EcLevel::M,
        3 => EcLevel::H,
        _ => EcLevel::Q,
    }
}

pub fn qr_png_bytes_inner(
    text: &str,
    size: u32,
    margin: u32,
    ecc: u8,
) -> Result<Vec<u8>, GenerateError> {
    let size = size.max(128);

    let code = QrCode::with_error_correction_level(text.as_bytes(), ecc_from_u8(ecc))
        .map_err(|e| GenerateError::Qr(e.to_string()))?;

    let modules = code.width() as u32;
    let total_modules = modules + margin * 2;

    let scale = (size / total_modules).max(1);
    let img_size = total_modules * scale;

    let mut pixels = vec![255u8; (img_size * img_size) as usize];

    for y in 0..modules {
        for x in 0..modules {
            if matches!(code[(x as usize, y as usize)], Color::Dark) {
                let start_x = (x + margin) * scale;
                let start_y = (y + margin) * scale;

                for dy in 0..scale {
                    let row = start_y + dy;
                    let row_start = (row * img_size + start_x) as usize;
                    let row_end = row_start + scale as usize;
                    pixels[row_start..row_end].fill(0u8);
                }
            }
        }
    }

    let final_size = size;
    let final_pixels = if img_size == final_size {
        pixels
    } else {
        let mut out = vec![255u8; (final_size * final_size) as usize];
        let offset = (final_size - img_size) / 2;

        for y in 0..img_size {
            let src_row = (y * img_size) as usize;
            let dst_row = ((y + offset) * final_size + offset) as usize;

            out[dst_row..dst_row + img_size as usize]
                .copy_from_slice(&pixels[src_row..src_row + img_size as usize]);
        }

        out
    };

    let mut out_png = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut out_png, final_size, final_size);
        encoder.set_color(png::ColorType::Grayscale);
        encoder.set_depth(png::BitDepth::Eight);

        let mut writer = encoder
            .write_header()
            .map_err(|e| GenerateError::Png(format!("header error: {e}")))?;
        writer
            .write_image_data(&final_pixels)
            .map_err(|e| GenerateError::Png(format!("data error: {e}")))?;
    }

    Ok(out_png)
}
