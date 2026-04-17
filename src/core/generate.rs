use fast_qr::ECL;
use fast_qr::qr::QRBuilder;

use crate::core::types::{QrBitmap, QrModules};
use crate::error::GenerateError;

#[inline]
fn ecc_to_ecl(ecc: u8) -> ECL {
    match ecc {
        0 => ECL::L,
        1 => ECL::M,
        3 => ECL::H,
        _ => ECL::Q,
    }
}

/// Build QR at the module level (no rasterization). Uses `fast_qr` — typically
/// 3-8× faster than the `qrcode` crate at the same output.
pub fn generate_qr_modules(
    text: &str,
    size: u32,
    margin: u32,
    ecc: u8,
) -> Result<QrModules, GenerateError> {
    let size = size.max(128);

    let qr = QRBuilder::new(text.as_bytes().to_vec())
        .ecl(ecc_to_ecl(ecc))
        .build()
        .map_err(|e| GenerateError::Qr(format!("{e:?}")))?;

    let n = qr.size as u32;
    let scale = (size / n).max(1);

    let total = (n * n) as usize;
    let mut dark = Vec::with_capacity(total);
    // fast_qr indexes as `qr[y][x]` → &[Module]. Module::value() is bit 0.
    for y in 0..n as usize {
        let row = &qr[y];
        for x in 0..n as usize {
            dark.push(row[x].value());
        }
    }

    Ok(QrModules {
        n,
        margin,
        scale,
        dark,
    })
}

/// Rasterize modules into an 8-bit grayscale bitmap (0 = dark, 255 = light).
pub fn rasterize(m: &QrModules) -> QrBitmap {
    let img_size = m.img_size();
    let mut pixels = vec![255u8; (img_size * img_size) as usize];

    let scale = m.scale as usize;
    let img_w = img_size as usize;
    let margin = m.margin;

    for y in 0..m.n {
        let start_y = ((y + margin) * m.scale) as usize;
        for x in 0..m.n {
            if !m.is_dark(x, y) {
                continue;
            }
            let start_x = ((x + margin) * m.scale) as usize;
            for dy in 0..scale {
                let row_start = (start_y + dy) * img_w + start_x;
                pixels[row_start..row_start + scale].fill(0);
            }
        }
    }

    QrBitmap {
        width: img_size,
        height: img_size,
        pixels,
    }
}

pub fn generate_qr_bitmap(
    text: &str,
    size: u32,
    margin: u32,
    ecc: u8,
) -> Result<QrBitmap, GenerateError> {
    let modules = generate_qr_modules(text, size, margin, ecc)?;
    Ok(rasterize(&modules))
}
