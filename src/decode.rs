#![cfg(feature = "decode")]

use crate::error::DecodeError;
use rqrr::PreparedImage;

pub struct QrResult {
    pub text: String,
}

/// Decode a QR code from an RGBA image buffer.
pub fn decode_from_rgba(width: u32, height: u32, rgba: &[u8]) -> Result<QrResult, DecodeError> {
    let expected_len = (width * height * 4) as usize;
    if rgba.len() != expected_len {
        return Err(DecodeError::InvalidImage);
    }

    let mut gray = Vec::with_capacity((width * height) as usize);
    for i in (0..rgba.len()).step_by(4) {
        let r = rgba[i] as u32;
        let g = rgba[i + 1] as u32;
        let b = rgba[i + 2] as u32;
        let y = (r * 299 + g * 587 + b * 114) / 1000;
        gray.push(y as u8);
    }

    let mut img = PreparedImage::prepare_from_greyscale(width as usize, height as usize, |x, y| {
        gray[y * width as usize + x]
    });

    for grid in img.detect_grids() {
        if let Ok((_meta, content)) = grid.decode() {
            return Ok(QrResult { text: content });
        }
    }

    Err(DecodeError::NotFound)
}

/// Decode a QR code from encoded image bytes (PNG, JPEG, etc).
pub fn decode_from_bytes(bytes: &[u8]) -> Result<QrResult, DecodeError> {
    let img = image::load_from_memory(bytes).map_err(|_| DecodeError::InvalidImage)?;

    let rgba = img.to_rgba8();
    decode_from_rgba(img.width(), img.height(), &rgba)
}
