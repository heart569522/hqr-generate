use super::{Corner, QrResult};
use crate::error::DecodeError;

use image::ImageReader;
use rqrr::PreparedImage;
use std::io::Cursor;

/// Most pixels the decoder will process, and therefore roughly the largest
/// luminance buffer it will allocate (one byte per pixel).
///
/// A compressed image is a *description* of a canvas, not the canvas itself: a
/// 1.2 MB PNG can legitimately declare 16000x16000, which is 256 megapixels.
/// `image`'s own `max_alloc` does not save us, because the largest allocation
/// is the one this crate makes after decoding, which its accounting never sees.
/// So the header is checked before any pixels are read.
///
/// 40 MP leaves room for every phone camera and most flatbed scans; a QR code
/// needs a few hundred pixels across to read, not tens of thousands.
pub const MAX_DECODE_PIXELS: u64 = 40_000_000;

/// Hard ceiling on either side, independent of the total. Stops a 1 x 2^31
/// canvas from sneaking under the pixel budget.
const MAX_SIDE: u32 = 20_000;

fn check_dimensions(width: u32, height: u32) -> Result<(), DecodeError> {
    if width == 0 || height == 0 {
        return Err(DecodeError::InvalidImage);
    }
    let pixels = u64::from(width) * u64::from(height);
    if pixels > MAX_DECODE_PIXELS || width > MAX_SIDE || height > MAX_SIDE {
        return Err(DecodeError::ImageTooLarge {
            pixels: Some(pixels),
            max_pixels: MAX_DECODE_PIXELS,
        });
    }
    Ok(())
}

/// Locate every readable symbol, reading luminance through `sample`.
///
/// Taking a closure rather than a buffer is what keeps the RGBA path from
/// allocating a second full-size image just to hold greyscale.
fn decode_all_with<F>(width: usize, height: usize, sample: F) -> Result<Vec<QrResult>, DecodeError>
where
    F: Fn(usize, usize) -> u8,
{
    let mut img = PreparedImage::prepare_from_greyscale(width, height, sample);

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

pub(super) fn decode_all_from_rgba(
    width: u32,
    height: u32,
    rgba: &[u8],
) -> Result<Vec<QrResult>, DecodeError> {
    check_dimensions(width, height)?;

    let expected_len = (width as usize)
        .checked_mul(height as usize)
        .and_then(|px| px.checked_mul(4))
        .ok_or(DecodeError::InvalidImage)?;
    if rgba.len() != expected_len {
        return Err(DecodeError::InvalidImage);
    }

    let w = width as usize;

    // BT.601 luminance with integer shifts, computed on demand: no intermediate
    // greyscale buffer, no second pass over the image.
    decode_all_with(w, height as usize, |x, y| {
        let i = (y * w + x) * 4;
        let r = rgba[i] as u32;
        let g = rgba[i + 1] as u32;
        let b = rgba[i + 2] as u32;
        ((r * 77 + g * 150 + b * 29) >> 8) as u8
    })
}

fn reader(bytes: &[u8]) -> Result<ImageReader<Cursor<&[u8]>>, DecodeError> {
    let mut reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| DecodeError::InvalidImage)?;

    let mut limits = image::Limits::default();
    limits.max_image_width = Some(MAX_SIDE);
    limits.max_image_height = Some(MAX_SIDE);
    reader.limits(limits);

    Ok(reader)
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

    // Header first. Parsing dimensions is cheap and does not touch pixel data,
    // so an oversized image is refused before anything is allocated for it.
    let (width, height) = reader(bytes)?.into_dimensions().map_err(map_image_error)?;
    check_dimensions(width, height)?;

    let img = reader(bytes)?.decode().map_err(map_image_error)?;

    // Luma, not RGBA: a quarter of the memory, and the colour channels would be
    // collapsed to luminance on the very next line anyway.
    let luma = img.to_luma8();
    let w = luma.width() as usize;
    let samples = luma.as_raw();

    decode_all_with(w, luma.height() as usize, |x, y| samples[y * w + x])
}

fn map_image_error(e: image::ImageError) -> DecodeError {
    match e {
        image::ImageError::Unsupported(_) => DecodeError::UnsupportedFormat,
        image::ImageError::Limits(_) => DecodeError::ImageTooLarge {
            pixels: None,
            max_pixels: MAX_DECODE_PIXELS,
        },
        _ => DecodeError::InvalidImage,
    }
}
