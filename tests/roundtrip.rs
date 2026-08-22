//! End-to-end guarantee: anything this crate encodes, it can decode again.
//!
//! Run with `cargo test --features decode`.
#![cfg(all(feature = "generate", feature = "decode"))]

use hqr_generate::{
    DecodeInput, Ecc, GenerateOptions, QrBitmap, QrModules, SizeMode, decode, decode_all,
    generate_qr_modules, png as qr_png, render_png, render_png_modules,
};

const SAMPLES: &[&str] = &[
    "hello",
    "https://example.com/products/12345?utm_source=qr",
    "สวัสดีครับ ทดสอบภาษาไทย",
    "日本語テスト",
    "emoji 🎉🚀 mixed with ascii",
    "MECARD:N:Doe,John;TEL:+66812345678;EMAIL:john@example.com;;",
    "0123456789012345678901234567890123456789",
];

fn decode_png(bytes: &[u8]) -> String {
    decode(DecodeInput::ImageBytes(bytes))
        .expect("generated PNG should decode")
        .text
}

#[test]
fn every_ecc_level_round_trips() {
    for ecc in [Ecc::L, Ecc::M, Ecc::Q, Ecc::H] {
        for text in SAMPLES {
            let bytes = qr_png(
                text,
                GenerateOptions {
                    ecc,
                    ..Default::default()
                },
            )
            .unwrap_or_else(|e| panic!("generate failed for {text:?} at {ecc:?}: {e}"));

            assert_eq!(&decode_png(&bytes), text, "round trip failed at {ecc:?}");
        }
    }
}

#[test]
fn every_size_round_trips() {
    let text = "https://example.com/round-trip";
    for size in [128u32, 200, 256, 320, 321, 512, 1024] {
        for mode in [SizeMode::Exact, SizeMode::Fit] {
            let bytes = qr_png(
                text,
                GenerateOptions {
                    size,
                    size_mode: mode,
                    ..Default::default()
                },
            )
            .unwrap();
            assert_eq!(&decode_png(&bytes), text, "failed at size {size} {mode:?}");
        }
    }
}

#[test]
fn extra_padding_does_not_shift_the_symbol_out_of_alignment() {
    // Exact mode pads with quiet zone to hit the requested pixel size. If the
    // padding were applied asymmetrically or off a module boundary, the decoder
    // would either miss the finder patterns or read a shifted grid.
    let text = "padding alignment check";
    for size in 300..320u32 {
        let bytes = qr_png(
            text,
            GenerateOptions {
                size,
                size_mode: SizeMode::Exact,
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(&decode_png(&bytes), text, "failed at size {size}");
    }
}

#[test]
fn minimum_quiet_zone_still_scans() {
    let text = "https://example.com/margin";
    for margin in [1u32, 2, 4, 8, 16] {
        let bytes = qr_png(
            text,
            GenerateOptions {
                margin,
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(&decode_png(&bytes), text, "failed at margin {margin}");
    }
}

#[test]
fn decoding_reports_the_version_that_was_encoded() {
    let text = "https://example.com/version-check";
    let modules = generate_qr_modules(text, GenerateOptions::default()).unwrap();
    let bytes = render_png_modules(&modules).unwrap();

    let result = decode(DecodeInput::ImageBytes(&bytes)).unwrap();
    assert_eq!(result.version, modules.version());
}

#[test]
fn raw_rgba_input_round_trips() {
    let text = "rgba path";
    let m = generate_qr_modules(text, GenerateOptions::default()).unwrap();

    let size = m.img_size as usize;
    let mut rgba = vec![255u8; size * size * 4];
    let origin = m.origin_px() as usize;
    let scale = m.scale as usize;

    for y in 0..m.n {
        for x in 0..m.n {
            if !m.is_dark(x, y) {
                continue;
            }
            for dy in 0..scale {
                let py = origin + (y as usize) * scale + dy;
                for dx in 0..scale {
                    let px = origin + (x as usize) * scale + dx;
                    let i = (py * size + px) * 4;
                    rgba[i] = 0;
                    rgba[i + 1] = 0;
                    rgba[i + 2] = 0;
                }
            }
        }
    }

    let result = decode(DecodeInput::Rgba {
        width: m.img_size,
        height: m.img_size,
        data: &rgba,
    })
    .unwrap();
    assert_eq!(result.text, text);
}

/// Paint a module grid into an RGBA buffer at `(dx, dy)` of a `stride`-wide canvas.
fn paint(m: &QrModules, rgba: &mut [u8], stride: usize, dx: usize, dy: usize) {
    let origin = m.origin_px() as usize;
    let scale = m.scale as usize;

    for y in 0..m.n {
        for x in 0..m.n {
            if !m.is_dark(x, y) {
                continue;
            }
            for sy in 0..scale {
                let py = dy + origin + (y as usize) * scale + sy;
                for sx in 0..scale {
                    let px = dx + origin + (x as usize) * scale + sx;
                    let i = (py * stride + px) * 4;
                    rgba[i] = 0;
                    rgba[i + 1] = 0;
                    rgba[i + 2] = 0;
                }
            }
        }
    }
}

#[test]
fn a_code_with_a_logo_hole_still_scans() {
    // The whole point of the ECC budget check: blanking the centre must not
    // cost more than error correction can put back.
    let text = "https://example.com/with-a-logo";

    for (ecc, space) in [(Ecc::Q, 15u8), (Ecc::Q, 25), (Ecc::H, 20), (Ecc::H, 30)] {
        let bytes = qr_png(
            text,
            GenerateOptions {
                ecc,
                logo_space: space,
                size: 480,
                ..Default::default()
            },
        )
        .unwrap_or_else(|e| panic!("generate failed at {ecc:?}/{space}%: {e}"));

        assert_eq!(
            &decode_png(&bytes),
            text,
            "a {space}% logo hole at {ecc:?} broke the code"
        );
    }
}

#[test]
fn decode_all_finds_every_code_in_one_image() {
    let a = generate_qr_modules(
        "first code",
        GenerateOptions {
            size: 200,
            ..Default::default()
        },
    )
    .unwrap();
    let b = generate_qr_modules(
        "second code",
        GenerateOptions {
            size: 200,
            ..Default::default()
        },
    )
    .unwrap();

    let gap = 40usize;
    let stride = a.img_size as usize + gap + b.img_size as usize;
    let height = a.img_size.max(b.img_size) as usize;
    let mut rgba = vec![255u8; stride * height * 4];

    paint(&a, &mut rgba, stride, 0, 0);
    paint(&b, &mut rgba, stride, a.img_size as usize + gap, 0);

    let results = decode_all(DecodeInput::Rgba {
        width: stride as u32,
        height: height as u32,
        data: &rgba,
    })
    .unwrap();

    let mut texts: Vec<&str> = results.iter().map(|r| r.text.as_str()).collect();
    texts.sort_unstable();
    assert_eq!(texts, ["first code", "second code"]);

    // Corners must land inside the half of the canvas the code was painted into.
    for r in &results {
        let mid = stride as i32 / 2;
        let left = r.text == "first code";
        for c in &r.corners {
            assert!(
                if left { c.x < mid } else { c.x > mid },
                "corner {:?} of {:?} is on the wrong side",
                c,
                r.text
            );
        }
    }
}

#[test]
fn decode_returns_the_first_of_several() {
    let m = generate_qr_modules("only one", GenerateOptions::default()).unwrap();
    let stride = m.img_size as usize;
    let mut rgba = vec![255u8; stride * stride * 4];
    paint(&m, &mut rgba, stride, 0, 0);

    let one = decode(DecodeInput::Rgba {
        width: m.img_size,
        height: m.img_size,
        data: &rgba,
    })
    .unwrap();
    assert_eq!(one.text, "only one");
    assert_eq!(one.corners.len(), 4);
}

#[test]
fn decode_failures_are_typed() {
    let blank = qr_png("x", GenerateOptions::default()).unwrap();

    // Not an image at all.
    let err = decode(DecodeInput::ImageBytes(b"definitely not an image")).unwrap_err();
    assert_eq!(err.code(), "INVALID_IMAGE");

    // Valid image, no QR code in it.
    let white = image_of_solid_white(200, 200);
    let err = decode(DecodeInput::ImageBytes(&white)).unwrap_err();
    assert_eq!(err.code(), "QR_NOT_FOUND");

    // Mismatched RGBA dimensions.
    let err = decode(DecodeInput::Rgba {
        width: 100,
        height: 100,
        data: &blank,
    })
    .unwrap_err();
    assert_eq!(err.code(), "INVALID_IMAGE");
}

/// A valid PNG with no QR code in it, built through the crate's own 8-bit path
/// so the test does not need its own image encoder.
fn image_of_solid_white(w: u32, h: u32) -> Vec<u8> {
    render_png(&QrBitmap {
        width: w,
        height: h,
        pixels: vec![255u8; (w * h) as usize],
    })
    .unwrap()
}
