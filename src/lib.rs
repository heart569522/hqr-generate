// Core QR logic (no I/O, no WASM)
pub mod core;

pub mod error;

// Render QR bitmap into concrete formats (png/svg/...)
pub mod render;

pub use core::generate::{generate_qr_bitmap, generate_qr_modules, rasterize};

pub use render::png::{render_png, render_png_modules};
pub use render::svg::{render_svg, render_svg_modules};

#[cfg(feature = "decode")]
pub use core::decode;

// WASM bindings (JS-friendly API)
#[cfg(feature = "wasm")]
pub mod wasm;
