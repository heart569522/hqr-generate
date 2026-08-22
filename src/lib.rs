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
//! use hqr_generate::{GenerateOptions, png};
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
pub use render::svg::{render_svg, render_svg_modules};

#[cfg(feature = "decode")]
pub use core::decode::{Corner, QrResult, decode, decode_all};
#[cfg(feature = "decode")]
pub use core::types::DecodeInput;
#[cfg(feature = "decode")]
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
