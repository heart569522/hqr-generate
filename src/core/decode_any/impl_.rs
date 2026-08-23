use super::{AnyResult, Format};
use crate::error::DecodeError;

use image::ImageReader;
use rxing::BarcodeFormat;
use std::io::Cursor;

/// Same ceiling as the QR-only decoder, and for the same reason: a small file
/// can describe an enormous canvas, and the largest allocation is the luminance
/// buffer this crate builds, which the image decoder's own limits never see.
pub const MAX_DECODE_PIXELS: u64 = 40_000_000;

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

fn map_format(f: &BarcodeFormat) -> Format {
    match f {
        BarcodeFormat::QR_CODE | BarcodeFormat::MICRO_QR_CODE => Format::Qr,
        BarcodeFormat::AZTEC => Format::Aztec,
        BarcodeFormat::DATA_MATRIX => Format::DataMatrix,
        BarcodeFormat::PDF_417 => Format::Pdf417,
        BarcodeFormat::CODE_128 => Format::Code128,
        BarcodeFormat::CODE_39 => Format::Code39,
        BarcodeFormat::CODE_93 => Format::Code93,
        BarcodeFormat::CODABAR => Format::Codabar,
        BarcodeFormat::EAN_13 => Format::Ean13,
        BarcodeFormat::EAN_8 => Format::Ean8,
        BarcodeFormat::UPC_A => Format::UpcA,
        BarcodeFormat::UPC_E => Format::UpcE,
        BarcodeFormat::ITF => Format::Itf,
        _ => Format::Other,
    }
}

fn run(luma: Vec<u8>, width: u32, height: u32) -> Result<Vec<AnyResult>, DecodeError> {
    match rxing::helpers::detect_multiple_in_luma(luma, width, height) {
        Ok(results) if !results.is_empty() => Ok(results
            .into_iter()
            .map(|r| AnyResult {
                text: r.getText().to_string(),
                format: map_format(r.getBarcodeFormat()),
                points: r
                    .getPoints()
                    .iter()
                    .map(|p| (p.x.round() as i32, p.y.round() as i32))
                    .collect(),
            })
            .collect()),
        // rxing reports "nothing here" and "found something unreadable" through
        // the same error type, so unlike the QR path this cannot distinguish
        // them. NotFound is the honest answer for a caller deciding whether to
        // keep scanning.
        _ => Err(DecodeError::NotFound),
    }
}

pub(super) fn decode_all_from_rgba(
    width: u32,
    height: u32,
    rgba: &[u8],
) -> Result<Vec<AnyResult>, DecodeError> {
    check_dimensions(width, height)?;

    let expected = (width as usize)
        .checked_mul(height as usize)
        .and_then(|px| px.checked_mul(4))
        .ok_or(DecodeError::InvalidImage)?;
    if rgba.len() != expected {
        return Err(DecodeError::InvalidImage);
    }

    // BT.601 with integer shifts, same as the QR path. rxing wants an owned
    // buffer, so this one allocation is unavoidable here.
    let luma: Vec<u8> = rgba
        .as_chunks::<4>()
        .0
        .iter()
        .map(|px| {
            let (r, g, b) = (px[0] as u32, px[1] as u32, px[2] as u32);
            ((r * 77 + g * 150 + b * 29) >> 8) as u8
        })
        .collect();

    run(luma, width, height)
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

pub(super) fn decode_all_from_bytes(bytes: &[u8]) -> Result<Vec<AnyResult>, DecodeError> {
    if bytes.is_empty() {
        return Err(DecodeError::InvalidImage);
    }
    if image::guess_format(bytes).is_err() {
        return Err(DecodeError::InvalidImage);
    }

    // Header first: an oversized image is refused before anything is allocated.
    let (width, height) = reader(bytes)?.into_dimensions().map_err(map_image_error)?;
    check_dimensions(width, height)?;

    let img = reader(bytes)?.decode().map_err(map_image_error)?;
    let luma = img.to_luma8();
    let (w, h) = (luma.width(), luma.height());

    run(luma.into_raw(), w, h)
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
