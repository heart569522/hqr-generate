// ---- Core ----
pub mod error;
pub mod generate;

// ---- Optional features ----
#[cfg(feature = "decode")]
pub mod decode;

#[cfg(feature = "wasm")]
pub mod wasm;
