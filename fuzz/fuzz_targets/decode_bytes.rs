//! Encoded image bytes — the path that reads whatever a user uploaded.
//!
//! The contract is narrow and absolute: for *any* input, `decode_all` returns
//! `Ok` or a typed `Err`. It never panics. `panic = "abort"` is set in the
//! release profile, so a single reachable panic takes the whole WASM instance
//! down — in a browser tab, or in a server handler decoding uploads.
//!
//! Seed the corpus with real images (`cargo run --example fuzz_seeds`).
//! Unstructured bytes are near-worthless here: `image::guess_format` rejects
//! them on the magic number before any decoder is reached.
#![no_main]

use barqr::{DecodeInput, decode_all};
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    let _ = decode_all(DecodeInput::ImageBytes(data));
});
