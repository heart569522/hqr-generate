//! 1D barcode encoding.
//!
//! A 1D symbology is a row of bars: `bars[i]` is one module wide, and the whole
//! row is drawn to a fixed height. That is the entire model — no masking, no
//! error correction, no version selection. It is why adding this costs almost
//! nothing next to QR.
#![cfg(feature = "barcode")]

use crate::error::GenerateError;

/// The 1D symbologies this build can produce.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Symbology {
    /// Dense, encodes the full ASCII range. The general-purpose choice.
    Code128,
    /// Uppercase letters, digits and a few symbols. Widely readable by old
    /// scanners, but wide.
    Code39,
    /// Code 39 with a modulo-43 check character appended.
    Code39Checksum,
    /// Denser than Code 39, same character set plus control codes.
    Code93,
    /// Digits and a dash. Used in telecoms.
    Code11,
    /// Digits and `ABCD` start/stop characters. Libraries, blood banks.
    Codabar,
    /// Retail, 13 digits. Pass 12 and the check digit is computed for you.
    Ean13,
    /// Retail on small packages, 8 digits.
    Ean8,
    /// Interleaved 2 of 5. Digits only, in pairs. Shipping cartons.
    Itf,
}

impl Symbology {
    /// FFI decoding, and the string the JS layer accepts.
    pub fn from_u8(v: u8) -> Option<Self> {
        Some(match v {
            0 => Self::Code128,
            1 => Self::Code39,
            2 => Self::Code39Checksum,
            3 => Self::Code93,
            4 => Self::Code11,
            5 => Self::Codabar,
            6 => Self::Ean13,
            7 => Self::Ean8,
            8 => Self::Itf,
            _ => return None,
        })
    }

    /// Whether the symbology conventionally prints its data underneath.
    pub fn shows_text_by_default(self) -> bool {
        matches!(self, Self::Ean13 | Self::Ean8)
    }
}

/// How a barcode is laid out. Unlike QR there is no square to fit: the width
/// falls out of the data, and only the height is chosen.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BarcodeOptions {
    /// Pixels per narrow bar. Whole numbers only — a fractional bar width is
    /// the classic way to make a barcode that scanners refuse.
    pub module_width: u32,
    /// Bar height in pixels.
    pub height: u32,
    /// Quiet zone on the left and right, in modules. The spec asks for 10;
    /// scanners rely on it to find the edges.
    pub quiet: u32,
}

impl Default for BarcodeOptions {
    fn default() -> Self {
        Self {
            module_width: 2,
            height: 80,
            quiet: 10,
        }
    }
}

/// Upper bounds, for the same reason [`crate::MAX_SIZE`] exists.
pub const MAX_MODULE_WIDTH: u32 = 64;
pub const MAX_BARCODE_HEIGHT: u32 = 4_096;
pub const MAX_BARCODE_QUIET: u32 = 128;

/// An encoded barcode, before rasterization.
#[derive(Clone, PartialEq, Eq)]
pub struct BarcodeModules {
    /// One entry per module, left to right. `true` is a bar.
    pub bars: Vec<bool>,
    pub module_width: u32,
    pub height: u32,
    pub quiet: u32,
    /// The data as encoded — including any check digit that was computed, which
    /// is what should be printed under the bars.
    pub text: String,
    pub symbology: Symbology,
}

impl core::fmt::Debug for BarcodeModules {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("BarcodeModules")
            .field("symbology", &self.symbology)
            .field("modules", &self.bars.len())
            .field("module_width", &self.module_width)
            .field("height", &self.height)
            .finish_non_exhaustive()
    }
}

impl BarcodeModules {
    /// Total image width in pixels, quiet zones included.
    #[inline]
    pub fn img_width(&self) -> u32 {
        (self.bars.len() as u32 + self.quiet * 2) * self.module_width
    }

    /// Pixel offset of the first module.
    #[inline]
    pub fn origin_px(&self) -> u32 {
        self.quiet * self.module_width
    }
}

fn encode(symbology: Symbology, text: &str) -> Result<(Vec<u8>, String), GenerateError> {
    use barcoders::sym::{
        codabar::Codabar, code11::Code11, code39::Code39, code93::Code93, code128::Code128,
        ean8::EAN8, ean13::EAN13, tf::TF,
    };

    let bad = |e: barcoders::error::Error| GenerateError::Barcode {
        symbology: symbology_name(symbology),
        reason: e.to_string(),
    };

    Ok(match symbology {
        // Code 128 picks a character set per run; `Ɓ` selects code set B, which
        // covers the printable ASCII range callers actually pass.
        Symbology::Code128 => {
            let c = Code128::new(format!("\u{0181}{text}")).map_err(bad)?;
            (c.encode(), text.to_string())
        }
        Symbology::Code39 => {
            let c = Code39::new(text).map_err(bad)?;
            (c.encode(), text.to_string())
        }
        Symbology::Code39Checksum => {
            let c = Code39::with_checksum(text).map_err(bad)?;
            (c.encode(), text.to_string())
        }
        Symbology::Code93 => {
            let c = Code93::new(text).map_err(bad)?;
            (c.encode(), text.to_string())
        }
        Symbology::Code11 => {
            let c = Code11::new(text).map_err(bad)?;
            (c.encode(), text.to_string())
        }
        Symbology::Codabar => {
            let c = Codabar::new(text).map_err(bad)?;
            (c.encode(), text.to_string())
        }
        Symbology::Ean13 => {
            let c = EAN13::new(text).map_err(bad)?;
            (c.encode(), full_ean(text, 13))
        }
        Symbology::Ean8 => {
            let c = EAN8::new(text).map_err(bad)?;
            (c.encode(), full_ean(text, 8))
        }
        Symbology::Itf => {
            let c = TF::interleaved(text).map_err(bad)?;
            (c.encode(), text.to_string())
        }
    })
}

/// EAN accepts the code with or without its check digit. When it was computed
/// for us, the printed text has to include it, or the digits under the bars
/// disagree with the bars themselves.
fn full_ean(text: &str, len: usize) -> String {
    if text.len() >= len {
        return text.to_string();
    }
    let digits: Vec<u8> = text
        .chars()
        .filter_map(|c| c.to_digit(10))
        .map(|d| d as u8)
        .collect();
    // Modulo-10, weights alternating from the right.
    let sum: u32 = digits
        .iter()
        .rev()
        .enumerate()
        .map(|(i, &d)| u32::from(d) * if i % 2 == 0 { 3 } else { 1 })
        .sum();
    format!("{text}{}", (10 - (sum % 10)) % 10)
}

fn symbology_name(s: Symbology) -> &'static str {
    match s {
        Symbology::Code128 => "code128",
        Symbology::Code39 => "code39",
        Symbology::Code39Checksum => "code39-checksum",
        Symbology::Code93 => "code93",
        Symbology::Code11 => "code11",
        Symbology::Codabar => "codabar",
        Symbology::Ean13 => "ean13",
        Symbology::Ean8 => "ean8",
        Symbology::Itf => "itf",
    }
}

/// Encode `text` in `symbology`, ready to render.
pub fn generate_barcode_modules(
    text: &str,
    symbology: Symbology,
    opts: BarcodeOptions,
) -> Result<BarcodeModules, GenerateError> {
    if text.is_empty() {
        return Err(GenerateError::EmptyText);
    }
    if opts.module_width == 0 || opts.module_width > MAX_MODULE_WIDTH {
        return Err(GenerateError::InvalidSize);
    }
    if opts.height == 0 || opts.height > MAX_BARCODE_HEIGHT {
        return Err(GenerateError::InvalidSize);
    }
    if opts.quiet > MAX_BARCODE_QUIET {
        return Err(GenerateError::InvalidMargin { margin: opts.quiet });
    }

    let (encoded, text) = encode(symbology, text)?;

    Ok(BarcodeModules {
        bars: encoded.into_iter().map(|b| b == 1).collect(),
        module_width: opts.module_width,
        height: opts.height,
        quiet: opts.quiet,
        text,
        symbology,
    })
}
