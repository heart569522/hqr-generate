//! Fast, scan-reliable black & white QR codes.
//!
//! The crate is split so that a build only pays for what it uses:
//!
//! - `generate` (default) — QR encoding plus the PNG and SVG renderers.
//! - `decode` — reading QR codes back out of images.
//! - `wasm` — JS bindings over whichever of the two above are enabled.
//!
//! The pipeline is two-stage: [`generate_qr_modules`] builds the cheap module
//! grid (~`n^2` bools, `n` is 21..=177), and only the renderer touches pixels.
//!
//! ```
//! use barqr::{GenerateOptions, png};
//!
//! let bytes = png("https://example.com", GenerateOptions::default()).unwrap();
//! assert_eq!(&bytes[..4], b"\x89PNG");
//! ```

pub mod core;
pub mod error;

/// Render a QR module grid into a concrete format (PNG / SVG).
#[cfg(feature = "generate")]
pub mod render;

pub use core::types::{Ecc, GenerateOptions, SizeMode};

#[cfg(feature = "generate")]
pub use core::generate::{
    MAX_MARGIN, MAX_SIZE, generate_qr_bitmap, generate_qr_modules, rasterize,
};
#[cfg(feature = "generate")]
pub use core::types::{QrBitmap, QrModules};
#[cfg(feature = "generate")]
pub use error::GenerateError;
#[cfg(feature = "generate")]
pub use render::png::{render_png, render_png_modules};
#[cfg(feature = "generate")]
pub use render::svg::{render_svg_modules, render_svg_modules_with_logo};

#[cfg(feature = "barcode")]
pub use core::barcode::{BarcodeModules, BarcodeOptions, Symbology, generate_barcode_modules};
#[cfg(feature = "barcode")]
pub use render::barcode::{render_barcode_png, render_barcode_svg};

/// Encode `text` as a 1D barcode, as a 1-bit grayscale PNG.
#[cfg(feature = "barcode")]
pub fn barcode_png(
    text: &str,
    symbology: Symbology,
    opts: BarcodeOptions,
) -> Result<Vec<u8>, GenerateError> {
    render_barcode_png(&generate_barcode_modules(text, symbology, opts)?)
}

/// Encode `text` as a 1D barcode, as SVG. `show_text` prints the data below
/// the bars, which retail symbologies conventionally do.
#[cfg(feature = "barcode")]
pub fn barcode_svg(
    text: &str,
    symbology: Symbology,
    opts: BarcodeOptions,
    show_text: bool,
) -> Result<String, GenerateError> {
    Ok(render_barcode_svg(
        &generate_barcode_modules(text, symbology, opts)?,
        show_text,
    ))
}

#[cfg(feature = "decode")]
pub use core::decode::{Corner, QrResult, decode, decode_all};

#[cfg(feature = "decode-any")]
pub use core::decode_any::{AnyResult, Format, decode_any, decode_any_all};
#[cfg(any(feature = "decode", feature = "decode-any"))]
pub use core::types::DecodeInput;
#[cfg(any(feature = "decode", feature = "decode-any"))]
pub use error::DecodeError;

/// Encode `text` as a 1-bit grayscale PNG.
#[cfg(feature = "generate")]
pub fn png(text: &str, opts: GenerateOptions) -> Result<Vec<u8>, GenerateError> {
    render_png_modules(&generate_qr_modules(text, opts)?)
}

/// Encode `text` as an SVG document (a single `<path>`).
#[cfg(feature = "generate")]
pub fn svg(text: &str, opts: GenerateOptions) -> Result<String, GenerateError> {
    Ok(render_svg_modules(&generate_qr_modules(text, opts)?))
}

// WASM bindings (JS-friendly API)
#[cfg(feature = "wasm")]
pub mod wasm;
