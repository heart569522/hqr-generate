//! Decoding every symbology, not just QR.
//!
//! A separate module from [`crate::core::decode`] on purpose. `rxing` is a full
//! ZXing port and costs roughly 220 KB gzipped more than `rqrr`; a page that
//! only reads QR codes should not carry that. The npm package ships them as two
//! WASM binaries and loads whichever the caller asks for.
#![cfg(feature = "decode-any")]

mod impl_;

use crate::core::types::DecodeInput;
use crate::error::DecodeError;

pub use impl_::MAX_DECODE_PIXELS;

/// A symbology `decode_any` can recognise.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Format {
    Qr,
    Aztec,
    DataMatrix,
    Pdf417,
    Code128,
    Code39,
    Code93,
    Codabar,
    Ean13,
    Ean8,
    UpcA,
    UpcE,
    Itf,
    Other,
}

impl Format {
    /// The string the JS layer reports, matching the `format` names the
    /// encoder accepts wherever the two overlap.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Qr => "qr",
            Self::Aztec => "aztec",
            Self::DataMatrix => "datamatrix",
            Self::Pdf417 => "pdf417",
            Self::Code128 => "code128",
            Self::Code39 => "code39",
            Self::Code93 => "code93",
            Self::Codabar => "codabar",
            Self::Ean13 => "ean13",
            Self::Ean8 => "ean8",
            Self::UpcA => "upca",
            Self::UpcE => "upce",
            Self::Itf => "itf",
            Self::Other => "other",
        }
    }
}

/// One symbol found in an image.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AnyResult {
    pub text: String,
    pub format: Format,
    /// Where the symbol sits in the source image. 1D symbologies report two
    /// points (the ends of the bar row); 2D report three or four.
    pub points: Vec<(i32, i32)>,
}

/// Decode the first symbol of any supported format.
pub fn decode_any(input: DecodeInput) -> Result<AnyResult, DecodeError> {
    decode_any_all(input)?
        .into_iter()
        .next()
        .ok_or(DecodeError::NotFound)
}

/// Decode every symbol in the image, of any supported format.
pub fn decode_any_all(input: DecodeInput) -> Result<Vec<AnyResult>, DecodeError> {
    match input {
        DecodeInput::Rgba {
            width,
            height,
            data,
        } => impl_::decode_all_from_rgba(width, height, data),
        DecodeInput::ImageBytes(bytes) => impl_::decode_all_from_bytes(bytes),
    }
}
