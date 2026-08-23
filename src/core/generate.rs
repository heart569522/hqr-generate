//! QR encoding at the module level, plus the legacy 8-bit rasterizer.

use fast_qr::ECL;
use fast_qr::qr::{QRBuilder, QRCodeError};

use crate::core::types::{Ecc, GenerateOptions, QrBitmap, QrModules, SizeMode};
use crate::error::GenerateError;

/// Upper bound on the rendered edge length. A 1-bit PNG at 16384 px is ~33 MB
/// of scanline buffer; anything past that is a caller mistake, not a QR code.
pub const MAX_SIZE: u32 = 16_384;

/// Upper bound on the quiet zone. The spec asks for 4 modules; 64 is already
/// far past anything a real layout needs.
pub const MAX_MARGIN: u32 = 64;

/// Hard ceiling on the centre area a logo may blank out, as a percentage of the
/// symbol width. Error correction can technically cover more, but leaving no
/// margin for real-world damage — glare, creases, a phone at an angle — trades
/// a scannable code for a prettier one.
pub const MAX_LOGO_SPACE: u32 = 35;

/// Widest centre square this symbol will allow, as a percentage of its width.
///
/// Two limits apply. Error correction has to reconstruct every module the logo
/// covers, and we spend at most half its budget so the rest is left for damage.
/// Separately, the square must not reach the finder patterns or their
/// separators (8 modules in from each corner) — those are what a scanner uses
/// to locate the code at all, and no amount of ECC brings them back.
fn max_logo_space(n: u32, ecc: Ecc) -> u32 {
    // area <= recovery/2  =>  width <= sqrt(recovery/2)  =>  percent = sqrt(50 * recovery)
    let by_ecc = (50 * ecc.recovery_percent()).isqrt().min(MAX_LOGO_SPACE);
    let by_structure = n.saturating_sub(16) * 100 / n;
    by_ecc.min(by_structure)
}

/// Side of the blanked centre square in modules, or 0 when `percent` is 0.
fn logo_side(n: u32, percent: u8, ecc: Ecc) -> Result<u32, GenerateError> {
    if percent == 0 {
        return Ok(0);
    }

    let max_percent = max_logo_space(n, ecc);
    if u32::from(percent) > max_percent {
        return Err(GenerateError::LogoSpaceTooLarge {
            requested_percent: percent,
            max_percent: max_percent as u8,
        });
    }

    // `n` is always odd, so an odd side leaves an equal gap on both sides and
    // the square sits exactly on the centre module.
    let mut side = (n * u32::from(percent)).div_ceil(100).max(1);
    if side % 2 == 0 {
        side -= 1;
    }
    Ok(side.max(1))
}

#[inline]
fn ecl_of(ecc: Ecc) -> ECL {
    match ecc {
        Ecc::L => ECL::L,
        Ecc::M => ECL::M,
        Ecc::Q => ECL::Q,
        Ecc::H => ECL::H,
    }
}

/// Resolve `size` into `(scale, img_size, offset)`.
///
/// `scale` is always a whole number of pixels per module, so module edges never
/// land mid-pixel — that is what keeps the output crisp and scannable. Under
/// [`SizeMode::Exact`] the pixels left over after integer scaling become extra
/// quiet zone rather than a fractional scale.
#[inline]
fn layout(total_modules: u32, size: u32, mode: SizeMode) -> (u32, u32, u32) {
    let scale = (size / total_modules).max(1);
    let area = total_modules * scale;

    match mode {
        SizeMode::Fit => (scale, area, 0),
        SizeMode::Exact => {
            // `size` can be smaller than `area` only when the symbol needs more
            // pixels than requested (scale was clamped to 1). Growing to `area`
            // beats emitting a scaled-down, unscannable image.
            let img = size.max(area);
            (scale, img, (img - area) / 2)
        }
    }
}

/// Build a QR code at the module level. No pixels are allocated here — pass the
/// result to [`crate::render::png::render_png_modules`] or
/// [`crate::render::svg::render_svg_modules`].
pub fn generate_qr_modules(text: &str, opts: GenerateOptions) -> Result<QrModules, GenerateError> {
    if text.is_empty() {
        return Err(GenerateError::EmptyText);
    }
    if opts.size == 0 || opts.size > MAX_SIZE {
        return Err(GenerateError::InvalidSize);
    }
    if opts.margin > MAX_MARGIN {
        return Err(GenerateError::InvalidMargin {
            margin: opts.margin,
        });
    }

    let qr = QRBuilder::new(text.as_bytes().to_vec())
        .ecl(ecl_of(opts.ecc))
        .build()
        .map_err(|e| match e {
            QRCodeError::EncodedData => GenerateError::PayloadTooLong { len: text.len() },
            other => GenerateError::Encode(format!("{other}")),
        })?;

    let n = qr.size as u32;
    let logo_modules = logo_side(n, opts.logo_space, opts.ecc)?;
    let total = n + opts.margin * 2;
    let (scale, img_size, offset) = layout(total, opts.size, opts.size_mode);

    let mut dark = Vec::with_capacity((n * n) as usize);
    // fast_qr indexes as `qr[y][x]` -> &[Module]; Module::value() is the bit.
    for y in 0..n as usize {
        let row = &qr[y];
        dark.extend(row[..n as usize].iter().map(|m| m.value()));
    }

    if logo_modules > 0 {
        let start = (n - logo_modules) / 2;
        for y in start..start + logo_modules {
            let row = (y * n) as usize;
            dark[row + start as usize..row + (start + logo_modules) as usize].fill(false);
        }
    }

    Ok(QrModules {
        n,
        margin: opts.margin,
        scale,
        offset,
        img_size,
        logo_modules,
        dark,
    })
}

/// Rasterize modules into an 8-bit grayscale bitmap (0 = dark, 255 = light).
///
/// The renderers never call this — they work straight off [`QrModules`] and
/// allocate no pixel buffer at all. It exists for callers who want the pixels
/// themselves: compositing a logo, drawing into an existing surface, or handing
/// the buffer to another encoder.
pub fn rasterize(m: &QrModules) -> QrBitmap {
    let img_size = m.img_size;
    let mut pixels = vec![255u8; (img_size * img_size) as usize];

    let scale = m.scale as usize;
    let img_w = img_size as usize;
    let origin = m.origin_px() as usize;

    for y in 0..m.n {
        let start_y = origin + (y as usize) * scale;
        for x in 0..m.n {
            if !m.is_dark(x, y) {
                continue;
            }
            let start_x = origin + (x as usize) * scale;
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

pub fn generate_qr_bitmap(text: &str, opts: GenerateOptions) -> Result<QrBitmap, GenerateError> {
    Ok(rasterize(&generate_qr_modules(text, opts)?))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts(size: u32, mode: SizeMode) -> GenerateOptions {
        GenerateOptions {
            size,
            size_mode: mode,
            ..Default::default()
        }
    }

    #[test]
    fn exact_mode_hits_the_requested_size() {
        for size in [64u32, 100, 128, 256, 320, 321, 512, 1000] {
            let m = generate_qr_modules("https://example.com/hello", opts(size, SizeMode::Exact))
                .unwrap();
            assert_eq!(m.img_size, size, "size {size} was not honoured exactly");
        }
    }

    #[test]
    fn fit_mode_never_exceeds_the_requested_size() {
        for size in [64u32, 320, 321, 999] {
            let m = generate_qr_modules("https://example.com/hello", opts(size, SizeMode::Fit))
                .unwrap();
            assert!(m.img_size <= size, "fit produced {} > {size}", m.img_size);
            assert_eq!(m.img_size, (m.n + m.margin * 2) * m.scale);
            assert_eq!(m.offset, 0);
        }
    }

    #[test]
    fn modules_stay_on_whole_pixels_and_inside_the_image() {
        let m =
            generate_qr_modules("https://example.com/hello", opts(320, SizeMode::Exact)).unwrap();
        let content_end = m.origin_px() + m.n * m.scale;
        assert!(content_end <= m.img_size);
        // Padding is symmetric to within the odd-pixel remainder.
        let trailing = m.img_size - (m.offset + (m.n + m.margin * 2) * m.scale);
        assert!(trailing.abs_diff(m.offset) <= 1);
    }

    #[test]
    fn tiny_size_falls_back_to_one_pixel_per_module_instead_of_blurring() {
        let m = generate_qr_modules("hello", opts(4, SizeMode::Exact)).unwrap();
        assert_eq!(m.scale, 1);
        assert_eq!(m.img_size, m.n + m.margin * 2);
    }

    #[test]
    fn version_matches_module_count() {
        let m = generate_qr_modules("hello", GenerateOptions::default()).unwrap();
        assert_eq!(m.n, 17 + 4 * m.version());
    }

    #[test]
    fn rejects_bad_input() {
        assert_eq!(
            generate_qr_modules("", GenerateOptions::default()).unwrap_err(),
            GenerateError::EmptyText
        );
        assert_eq!(
            generate_qr_modules("x", opts(0, SizeMode::Exact)).unwrap_err(),
            GenerateError::InvalidSize
        );
        assert_eq!(
            generate_qr_modules("x", opts(MAX_SIZE + 1, SizeMode::Exact)).unwrap_err(),
            GenerateError::InvalidSize
        );
        assert!(matches!(
            generate_qr_modules(
                "x",
                GenerateOptions {
                    margin: MAX_MARGIN + 1,
                    ..Default::default()
                }
            )
            .unwrap_err(),
            GenerateError::InvalidMargin { .. }
        ));
    }

    #[test]
    fn oversized_payload_reports_a_typed_error() {
        let huge = "x".repeat(8000);
        let err = generate_qr_modules(&huge, GenerateOptions::default()).unwrap_err();
        assert_eq!(err.code(), "PAYLOAD_TOO_LONG");
    }

    #[test]
    fn higher_ecc_needs_a_bigger_symbol() {
        let text = "https://example.com/some/path?with=query&and=more";
        let l = generate_qr_modules(
            text,
            GenerateOptions {
                ecc: Ecc::L,
                ..Default::default()
            },
        )
        .unwrap();
        let h = generate_qr_modules(
            text,
            GenerateOptions {
                ecc: Ecc::H,
                ..Default::default()
            },
        )
        .unwrap();
        assert!(
            h.n > l.n,
            "H ({}) should need more modules than L ({})",
            h.n,
            l.n
        );
    }

    #[test]
    fn logo_space_blanks_a_centred_square_clear_of_the_finders() {
        let m = generate_qr_modules(
            "https://example.com/logo",
            GenerateOptions {
                ecc: Ecc::H,
                logo_space: 20,
                ..Default::default()
            },
        )
        .unwrap();

        assert!(m.logo_modules > 0);
        assert_eq!(m.logo_modules % 2, 1, "odd side keeps the square centred");

        let start = (m.n - m.logo_modules) / 2;
        assert!(start >= 8, "square must stay clear of the finder patterns");
        assert!(start + m.logo_modules <= m.n - 8);

        for y in start..start + m.logo_modules {
            for x in start..start + m.logo_modules {
                assert!(!m.is_dark(x, y), "module ({x}, {y}) should be blank");
            }
        }
    }

    #[test]
    fn logo_space_is_refused_when_error_correction_cannot_cover_it() {
        // L can only recover ~7% of the symbol; a 30%-wide square is ~9% of the
        // area before any real-world damage is accounted for.
        let err = generate_qr_modules(
            "https://example.com/logo",
            GenerateOptions {
                ecc: Ecc::L,
                logo_space: 30,
                ..Default::default()
            },
        )
        .unwrap_err();
        assert_eq!(err.code(), "LOGO_SPACE_TOO_LARGE");

        // The same request is fine at H.
        assert!(
            generate_qr_modules(
                "https://example.com/logo",
                GenerateOptions {
                    ecc: Ecc::H,
                    logo_space: 30,
                    ..Default::default()
                },
            )
            .is_ok()
        );
    }

    #[test]
    fn logo_rect_lines_up_with_the_module_grid() {
        let m = generate_qr_modules(
            "https://example.com/logo",
            GenerateOptions {
                ecc: Ecc::H,
                logo_space: 25,
                size: 400,
                ..Default::default()
            },
        )
        .unwrap();

        let (x, y, side) = m.logo_rect_px().unwrap();
        assert_eq!(x, y, "square is centred, so both axes match");
        assert_eq!(side, m.logo_modules * m.scale);
        // Equal gap on both sides of the image.
        assert_eq!(x + side + x, m.img_size);
    }

    #[test]
    fn no_logo_space_means_no_hole() {
        let m = generate_qr_modules("plain", GenerateOptions::default()).unwrap();
        assert_eq!(m.logo_modules, 0);
        assert!(m.logo_rect_px().is_none());
    }

    #[test]
    fn margin_widens_the_quiet_zone_not_the_symbol() {
        let a = generate_qr_modules(
            "hello",
            GenerateOptions {
                margin: 0,
                size: 320,
                ..Default::default()
            },
        )
        .unwrap();
        let b = generate_qr_modules(
            "hello",
            GenerateOptions {
                margin: 8,
                size: 320,
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(a.n, b.n);
        assert!(b.origin_px() > a.origin_px());
    }
}
