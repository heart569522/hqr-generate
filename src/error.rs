//! Error types shared by the encoder and decoder.
//!
//! Every variant carries a stable, machine-readable [`code`](GenerateError::code)
//! string. The WASM layer copies that code onto the thrown JS `Error` as
//! `err.code`, so callers can branch on failures without string-matching a
//! human-readable message.

use core::fmt;

/// Something went wrong while building or rendering a QR code.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GenerateError {
    /// `text` was empty. A QR code of nothing is not useful, and several
    /// scanners reject it outright, so we fail loudly instead.
    EmptyText,
    /// The payload does not fit in a QR symbol at the requested ECC level.
    /// Lower `ecc` (`H` -> `Q` -> `M` -> `L`) or shorten the payload.
    PayloadTooLong { len: usize },
    /// `size` was 0.
    InvalidSize,
    /// `margin` was absurd (a quiet zone wider than the symbol itself).
    InvalidMargin { margin: u32 },
    /// The requested logo area would blank out more of the symbol than the
    /// chosen error-correction level can reconstruct.
    LogoSpaceTooLarge {
        requested_percent: u8,
        max_percent: u8,
    },
    /// The QR encoder rejected the input for another reason.
    Encode(String),
    /// PNG serialization failed.
    Png(String),
}

impl GenerateError {
    /// Stable identifier, safe to branch on. Surfaced to JS as `err.code`.
    pub fn code(&self) -> &'static str {
        match self {
            Self::EmptyText => "EMPTY_TEXT",
            Self::PayloadTooLong { .. } => "PAYLOAD_TOO_LONG",
            Self::InvalidSize => "INVALID_SIZE",
            Self::InvalidMargin { .. } => "INVALID_MARGIN",
            Self::LogoSpaceTooLarge { .. } => "LOGO_SPACE_TOO_LARGE",
            Self::Encode(_) => "ENCODE_FAILED",
            Self::Png(_) => "PNG_FAILED",
        }
    }
}

impl fmt::Display for GenerateError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyText => f.write_str("text is empty"),
            Self::PayloadTooLong { len } => write!(
                f,
                "payload of {len} bytes does not fit in a QR symbol at this error-correction level; use a lower ecc or a shorter payload"
            ),
            Self::InvalidSize => f.write_str("size must be greater than 0"),
            Self::InvalidMargin { margin } => {
                write!(f, "margin of {margin} modules is out of range (max 64)")
            }
            Self::LogoSpaceTooLarge {
                requested_percent,
                max_percent,
            } => write!(
                f,
                "logoSpace of {requested_percent}% is more than error correction can recover here (max {max_percent}%); raise ecc or shrink the logo"
            ),
            Self::Encode(msg) => write!(f, "qr encoding failed: {msg}"),
            Self::Png(msg) => write!(f, "png encoding failed: {msg}"),
        }
    }
}

impl std::error::Error for GenerateError {}

/// Something went wrong while reading a QR code out of an image.
#[cfg(feature = "decode")]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DecodeError {
    /// The image was readable but contained no decodable QR symbol.
    NotFound,
    /// The buffer was not a valid image, or the RGBA dimensions did not match
    /// the data length.
    InvalidImage,
    /// The bytes are an image format this build does not include a decoder for
    /// (only PNG, JPEG and WebP are compiled in).
    UnsupportedFormat,
    /// A QR symbol was located but its contents could not be recovered.
    Corrupt(String),
}

#[cfg(feature = "decode")]
impl DecodeError {
    /// Stable identifier, safe to branch on. Surfaced to JS as `err.code`.
    pub fn code(&self) -> &'static str {
        match self {
            Self::NotFound => "QR_NOT_FOUND",
            Self::InvalidImage => "INVALID_IMAGE",
            Self::UnsupportedFormat => "UNSUPPORTED_FORMAT",
            Self::Corrupt(_) => "QR_CORRUPT",
        }
    }
}

#[cfg(feature = "decode")]
impl fmt::Display for DecodeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotFound => f.write_str("no QR code found in image"),
            Self::InvalidImage => f.write_str("input is not a valid image"),
            Self::UnsupportedFormat => {
                f.write_str("image format not supported (build includes png, jpeg, webp)")
            }
            Self::Corrupt(msg) => write!(f, "QR code found but could not be read: {msg}"),
        }
    }
}

#[cfg(feature = "decode")]
impl std::error::Error for DecodeError {}
