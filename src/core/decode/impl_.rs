use super::QrResult;
use crate::error::DecodeError;

use rqrr::PreparedImage;

pub(super) fn decode_from_rgba(
    width: u32,
    height: u32,
    rgba: &[u8],
) -> Result<QrResult, DecodeError> {
    let expected_len = (width * height * 4) as usize;
    if rgba.len() != expected_len {
        return Err(DecodeError::InvalidImage);
    }

    let w = width as usize;
    let h = height as usize;

    // Compute luminance inline via the rqrr closure — avoids allocating an
    // intermediate width*height grayscale buffer and a second pass over it.
    // BT.601 approximation with integer shifts: (77R + 150G + 29B) >> 8.
    let mut img = PreparedImage::prepare_from_greyscale(w, h, |x, y| {
        let i = (y * w + x) * 4;
        let r = rgba[i] as u32;
        let g = rgba[i + 1] as u32;
        let b = rgba[i + 2] as u32;
        ((r * 77 + g * 150 + b * 29) >> 8) as u8
    });

    for grid in img.detect_grids() {
        if let Ok((_meta, content)) = grid.decode() {
            return Ok(QrResult { text: content });
        }
    }

    Err(DecodeError::NotFound)
}

pub(super) fn decode_from_bytes(bytes: &[u8]) -> Result<QrResult, DecodeError> {
    let img = image::load_from_memory(bytes).map_err(|_| DecodeError::InvalidImage)?;

    let rgba = img.to_rgba8();
    decode_from_rgba(img.width(), img.height(), &rgba)
}
