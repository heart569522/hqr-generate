use base64::{Engine as _, engine::general_purpose::STANDARD};
use js_sys::Uint8Array;
use qrcode::types::Color;
use qrcode::{EcLevel, QrCode};
use wasm_bindgen::prelude::*;

// ecc: 0=L,1=M,2=Q,3=H  (เร็วกว่า string มาก)
#[inline]
fn ecc_from_u8(ecc: u8) -> EcLevel {
    match ecc {
        0 => EcLevel::L,
        1 => EcLevel::M,
        3 => EcLevel::H,
        _ => EcLevel::Q,
    }
}

// Core: คืน PNG bytes
fn qr_png_bytes_inner(text: &str, size: u32, margin: u32, ecc: u8) -> Result<Vec<u8>, JsValue> {
    let size = size.max(128);
    let margin = margin.max(4);

    let code = QrCode::with_error_correction_level(text.as_bytes(), ecc_from_u8(ecc))
        .map_err(|e| JsValue::from_str(&format!("QR error: {e}")))?;

    let modules = code.width() as u32;
    let total_modules = modules + margin * 2;

    let scale = (size / total_modules).max(1);
    let img_size = total_modules * scale;

    // L8 buffer: 1 byte ต่อ pixel
    let mut pixels = vec![255u8; (img_size * img_size) as usize];

    // วาดเฉพาะ dark modules เป็นบล็อกสีดำ (0)
    for y in 0..modules {
        for x in 0..modules {
            if matches!(code[(x as usize, y as usize)], Color::Dark) {
                let start_x = (x + margin) * scale;
                let start_y = (y + margin) * scale;

                // เขียนเป็นสี่เหลี่ยม scale x scale ลง buffer
                for dy in 0..scale {
                    let row = start_y + dy;
                    let row_start = (row * img_size + start_x) as usize;
                    let row_end = row_start + scale as usize;
                    pixels[row_start..row_end].fill(0u8);
                }
            }
        }
    }

    // Encode PNG ด้วย crate png (เบา + ตรง)
    let mut out = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut out, img_size, img_size);
        encoder.set_color(png::ColorType::Grayscale);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder
            .write_header()
            .map_err(|e| JsValue::from_str(&format!("PNG header error: {e}")))?;
        writer
            .write_image_data(&pixels)
            .map_err(|e| JsValue::from_str(&format!("PNG data error: {e}")))?;
    }

    Ok(out)
}

#[wasm_bindgen]
pub fn qr_png_bytes(text: &str, size: u32, margin: u32, ecc: u8) -> Result<Uint8Array, JsValue> {
    let png = qr_png_bytes_inner(text, size, margin, ecc)?;
    Ok(Uint8Array::from(png.as_slice()))
}

// ถ้าจะคงของเดิมไว้ (แต่ perf หนักกว่า): data url
#[wasm_bindgen]
pub fn qr_png_data_url(text: &str, size: u32, margin: u32, ecc: u8) -> Result<String, JsValue> {
    let png = qr_png_bytes_inner(text, size, margin, ecc)?;
    Ok(format!("data:image/png;base64,{}", STANDARD.encode(png)))
}
