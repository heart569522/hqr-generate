use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::ImageEncoder;
use image::{ImageBuffer, Luma};
use qrcode::types::Color;
use qrcode::{EcLevel, QrCode};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn qr_png_data_url(text: &str, size: u32, margin: u32, ecc: &str) -> Result<String, JsValue> {
    // guard rails เพื่อความเสถียรในการสแกน
    let size = size.max(128);
    let margin = margin.max(4);

    let ecc = match ecc {
        "L" => EcLevel::L,
        "M" => EcLevel::M,
        "H" => EcLevel::H,
        _ => EcLevel::Q, // default (เสถียร)
    };

    let code = QrCode::with_error_correction_level(text.as_bytes(), ecc)
        .map_err(|e| JsValue::from_str(&format!("QR error: {e}")))?;

    let modules = code.width() as u32;
    let total_modules = modules + margin * 2;

    // คำนวณ scale ให้ได้ขนาดภาพตาม size ที่ขอ (อย่างน้อย 1px ต่อ module)
    let scale = (size / total_modules).max(1);
    let img_size = total_modules * scale;

    // grayscale 8-bit: 0=black, 255=white
    let mut img: ImageBuffer<Luma<u8>, Vec<u8>> =
        ImageBuffer::from_pixel(img_size, img_size, Luma([255u8]));

    // วาด module สีดำแบบ “บล็อก” เพื่อไม่เกิด aliasing
    for y in 0..modules {
        for x in 0..modules {
            if matches!(code[(x as usize, y as usize)], Color::Dark) {
                let px = (x + margin) * scale;
                let py = (y + margin) * scale;
                for dy in 0..scale {
                    for dx in 0..scale {
                        img.put_pixel(px + dx, py + dy, Luma([0u8]));
                    }
                }
            }
        }
    }

    // encode PNG -> bytes
    let mut png = Vec::new();
    let encoder = image::codecs::png::PngEncoder::new(&mut png);

    // write_image ต้องการ raw bytes ของภาพ
    encoder
        .write_image(
            img.as_raw(),
            img_size,
            img_size,
            image::ExtendedColorType::L8,
        )
        .map_err(|e| JsValue::from_str(&format!("PNG encode error: {e}")))?;

    // bytes -> base64 data url
    let b64 = STANDARD.encode(png);
    Ok(format!("data:image/png;base64,{}", b64))
}
