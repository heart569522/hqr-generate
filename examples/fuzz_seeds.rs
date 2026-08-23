//! Write the fuzz seed corpus.
//!
//! libFuzzer mutates what it is given. Handed random bytes, it spends the whole
//! run failing `image::guess_format` on the magic number and never reaches a
//! decoder at all. Handed real images, its mutations land *inside* the format —
//! corrupt chunk lengths, impossible dimensions, truncated scanlines — which is
//! where the interesting failures live.
//!
//! Run: `cargo run --release --features decode --example fuzz_seeds`
use std::fs;
use std::path::Path;

use barqrcode::{Ecc, GenerateOptions, QrModules, generate_qr_modules, png, svg};

fn write(dir: &Path, name: &str, bytes: &[u8]) {
    fs::write(dir.join(name), bytes).expect("write seed");
}

/// Paint a module grid into an RGBA buffer.
fn to_rgba(m: &QrModules) -> Vec<u8> {
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
                for dx in 0..scale {
                    let py = origin + (y as usize) * scale + dy;
                    let px = origin + (x as usize) * scale + dx;
                    let i = (py * size + px) * 4;
                    rgba[i] = 0;
                    rgba[i + 1] = 0;
                    rgba[i + 2] = 0;
                }
            }
        }
    }
    rgba
}

fn main() {
    let bytes_dir = Path::new("fuzz/corpus/decode_bytes");
    let rgba_dir = Path::new("fuzz/corpus/decode_rgba");
    fs::create_dir_all(bytes_dir).unwrap();
    fs::create_dir_all(rgba_dir).unwrap();

    let mut count = 0;

    // --- PNG, across the shapes the encoder can produce ---
    for (i, (text, ecc, size, logo)) in [
        ("hi", Ecc::L, 64u32, 0u8),
        ("https://example.com", Ecc::M, 200, 0),
        ("https://example.com/a/b?c=d", Ecc::Q, 320, 0),
        ("สวัสดีครับ ทดสอบภาษาไทย", Ecc::H, 400, 0),
        ("https://example.com/with-a-logo", Ecc::H, 400, 24),
        (
            "0123456789012345678901234567890123456789012345678901234567890123456789",
            Ecc::H,
            512,
            0,
        ),
    ]
    .iter()
    .enumerate()
    {
        let opts = GenerateOptions {
            size: *size,
            ecc: *ecc,
            logo_space: *logo,
            ..Default::default()
        };
        let bytes = png(text, opts).expect("encode seed");
        write(bytes_dir, &format!("qr_{i}.png"), &bytes);
        count += 1;

        // Same picture as JPEG: a much larger decoder surface than PNG, and one
        // a phone camera would realistically hand us.
        let m = generate_qr_modules(text, opts).unwrap();
        let rgba = to_rgba(&m);
        let img = image::RgbaImage::from_raw(m.img_size, m.img_size, rgba.clone()).unwrap();
        let mut jpeg = Vec::new();
        image::DynamicImage::ImageRgba8(img)
            .to_rgb8()
            .write_with_encoder(image::codecs::jpeg::JpegEncoder::new_with_quality(
                &mut jpeg, 70,
            ))
            .unwrap();
        write(bytes_dir, &format!("qr_{i}.jpg"), &jpeg);
        count += 1;

        // RGBA seed: the target reads width from the first two bytes.
        if m.img_size <= 300 {
            let mut seed = ((m.img_size - 1) as u16).to_le_bytes().to_vec();
            seed.extend_from_slice(&rgba);
            write(rgba_dir, &format!("qr_{i}.rgba"), &seed);
            count += 1;
        }
    }

    // --- degenerate but valid: nothing to find, edge geometries ---
    let blank = png("x", GenerateOptions::default()).unwrap();
    write(bytes_dir, "truncated.png", &blank[..blank.len() / 2]);
    write(bytes_dir, "header_only.png", &blank[..33.min(blank.len())]);
    write(bytes_dir, "empty", b"");
    count += 3;

    // An SVG is not a raster format — it should be refused, not parsed.
    let markup = svg("https://example.com", GenerateOptions::default()).unwrap();
    write(bytes_dir, "not_an_image.svg", markup.as_bytes());
    count += 1;

    for (name, w, h) in [("one_px", 1u32, 1u32), ("wide", 256, 1), ("tall", 1, 256)] {
        let mut seed = ((w - 1) as u16).to_le_bytes().to_vec();
        seed.extend(std::iter::repeat_n(0x7f, (w * h * 4) as usize));
        write(rgba_dir, &format!("{name}.rgba"), &seed);
        count += 1;
    }

    println!("  wrote {count} seeds");
    println!("  {}", bytes_dir.display());
    println!("  {}", rgba_dir.display());
}
