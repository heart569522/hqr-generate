//! QR decoding from raw RGBA or encoded image bytes.
#![cfg(feature = "decode")]

mod impl_;
pub use impl_::MAX_DECODE_PIXELS;
use impl_::{decode_all_from_bytes, decode_all_from_rgba};

use crate::core::types::DecodeInput;
use crate::error::DecodeError;

/// A corner of a located QR symbol, in pixels of the source image.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Corner {
    pub x: i32,
    pub y: i32,
}

/// A successfully decoded QR code.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QrResult {
    pub text: String,
    /// QR version, 1..=40.
    pub version: u32,
    /// Error-correction level as encoded in the symbol (0..=3).
    pub ecc_level: u8,
    /// Where the symbol sits in the source image:
    /// top-left, top-right, bottom-right, bottom-left.
    pub corners: [Corner; 4],
}

/// Decode the first readable QR code in the image.
pub fn decode(input: DecodeInput) -> Result<QrResult, DecodeError> {
    decode_all(input)?
        .into_iter()
        .next()
        // `decode_all` only returns Ok with at least one result.
        .ok_or(DecodeError::NotFound)
}

/// Decode every readable QR code in the image, in the order they were located.
///
/// Returns `Err(NotFound)` rather than an empty `Vec` when nothing decodes, so
/// the failure reason (nothing there vs. found-but-unreadable) is not lost.
pub fn decode_all(input: DecodeInput) -> Result<Vec<QrResult>, DecodeError> {
    match input {
        DecodeInput::Rgba {
            width,
            height,
            data,
        } => decode_all_from_rgba(width, height, data),

        DecodeInput::ImageBytes(bytes) => decode_all_from_bytes(bytes),
    }
}
