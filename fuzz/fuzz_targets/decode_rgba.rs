//! Raw RGBA — the path a canvas or a camera frame takes.
//!
//! Here the *caller* supplies the dimensions, so the interesting inputs are
//! geometries rather than file formats: extreme aspect ratios, one-pixel edges,
//! buffers whose length does not match what the dimensions imply.
//!
//! Dimensions are derived from the input so that almost every case forms a
//! valid image. Feeding random width/height with a random buffer would spend
//! the whole run bouncing off the length check without reaching the decoder.
#![no_main]

use barqrcode::{DecodeInput, decode_all};
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if data.len() < 8 {
        return;
    }

    // Keep the canvas small: the fuzzer's value is in reaching many code paths
    // per second, not in re-proving the megapixel cap that already has a test.
    let width = (usize::from(u16::from_le_bytes([data[0], data[1]])) % 300) + 1;
    let rest = &data[2..];

    let height = rest.len() / (width * 4);
    if height == 0 {
        return;
    }

    let _ = decode_all(DecodeInput::Rgba {
        width: width as u32,
        height: height as u32,
        data: &rest[..width * height * 4],
    });
});
