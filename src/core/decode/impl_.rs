use super::{Corner, QrResult};
use crate::error::DecodeError;

use rqrr::PreparedImage;

pub(super) fn decode_all_from_rgba(
    width: u32,
    height: u32,
    rgba: &[u8],
) -> Result<Vec<QrResult>, DecodeError> {
    let expected_len = (width as usize)
        .checked_mul(height as usize)
        .and_then(|px| px.checked_mul(4))
        .ok_or(DecodeError::InvalidImage)?;
    if rgba.len() != expected_len || expected_len == 0 {
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

    // Distinguish "nothing here" from "found a symbol we could not read" — the
    // first means keep scanning, the second usually means bad focus or glare.
    let mut found = Vec::new();
    let mut last_failure: Option<String> = None;

    for grid in img.detect_grids() {
        match grid.decode() {
            Ok((meta, content)) => found.push(QrResult {
                text: content,
                version: meta.version.0 as u32,
                ecc_level: meta.ecc_level as u8,
                corners: grid.bounds.map(|p| Corner { x: p.x, y: p.y }),
            }),
            Err(e) => last_failure = Some(e.to_string()),
        }
    }

    if !found.is_empty() {
        return Ok(found);
    }

    match last_failure {
        Some(msg) => Err(DecodeError::Corrupt(msg)),
        None => Err(DecodeError::NotFound),
    }
}

pub(super) fn decode_all_from_bytes(bytes: &[u8]) -> Result<Vec<QrResult>, DecodeError> {
    if bytes.is_empty() {
        return Err(DecodeError::InvalidImage);
    }

    // Split "these bytes are not an image at all" from "this is a real image in
    // a format this build does not carry a decoder for" — the caller can retry
    // the second one after converting, but not the first.
    if image::guess_format(bytes).is_err() {
        return Err(DecodeError::InvalidImage);
    }

    let img = image::load_from_memory(bytes).map_err(|e| match e {
        image::ImageError::Unsupported(_) => DecodeError::UnsupportedFormat,
        _ => DecodeError::InvalidImage,
    })?;

    let rgba = img.to_rgba8();
    decode_all_from_rgba(img.width(), img.height(), &rgba)
}
