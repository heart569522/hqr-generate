//! Anything the encoder produces, the any-format decoder must read back.
//!
//! Run with `cargo test --features barcode,decode-any`.
#![cfg(all(feature = "barcode", feature = "decode-any"))]

use barqr::{
    BarcodeOptions, DecodeInput, Symbology, barcode_png, decode_any, decode_any_all,
    generate_barcode_modules,
};

/// Every symbology, with data it can actually represent, and the text a
/// decoder should hand back.
///
/// Two of these differ from what was encoded, and both are correct:
///
/// - **Codabar** brackets its payload with a start/stop character (`A`..`D`).
///   Those are delimiters, not data, and the decoder strips them.
/// - **EAN-13** is given without its check digit, which the encoder computes,
///   so the decoded text is one digit longer than the input.
const CASES: &[(Symbology, &str, &str)] = &[
    (Symbology::Code128, "HELLO-123", "HELLO-123"),
    (Symbology::Code39, "HELLO 123", "HELLO 123"),
    (Symbology::Code93, "HELLO123", "HELLO123"),
    (Symbology::Codabar, "A12345B", "12345"),
    (Symbology::Ean13, "590123412345", "5901234123457"),
    (Symbology::Ean8, "1234567", "12345670"),
    (Symbology::Itf, "12345678", "12345678"),
];

/// Bars need height and width to survive the decoder's edge detection; these
/// are ordinary print sizes, not generous ones.
fn opts() -> BarcodeOptions {
    BarcodeOptions {
        module_width: 3,
        height: 100,
        quiet: 12,
    }
}

#[test]
fn every_symbology_decodes_back_to_what_was_encoded() {
    for (symbology, data, expected) in CASES {
        let png = barcode_png(data, *symbology, opts())
            .unwrap_or_else(|e| panic!("encode failed for {symbology:?}: {e}"));

        let result = decode_any(DecodeInput::ImageBytes(&png))
            .unwrap_or_else(|e| panic!("{symbology:?} did not decode: {e}"));

        assert_eq!(&result.text, expected, "{symbology:?} round trip");
    }
}

/// UPC-A *is* EAN-13 with a leading zero — the same bars, two names. A decoder
/// reporting `upca` for a zero-prefixed EAN-13 is right, and callers matching
/// on `format` need to know it.
#[test]
fn a_zero_prefixed_ean13_reads_back_as_upca() {
    let png = barcode_png("012345678901", Symbology::Ean13, opts()).unwrap();
    let result = decode_any(DecodeInput::ImageBytes(&png)).unwrap();

    assert_eq!(result.format.as_str(), "upca");

    // Encoded as EAN-13 the text is 0123456789012, check digit included. Read
    // as UPC-A it is the same twelve digits without the leading zero UPC-A
    // implies — the bars did not change, only the name for them.
    let as_ean13 = generate_barcode_modules("012345678901", Symbology::Ean13, opts())
        .unwrap()
        .text;
    assert_eq!(as_ean13, "0123456789012");
    assert_eq!(result.text, as_ean13.strip_prefix('0').unwrap());
}

#[test]
fn the_reported_format_matches_what_was_encoded() {
    for (symbology, expected) in [
        (Symbology::Code128, "code128"),
        (Symbology::Code39, "code39"),
        // Not zero-prefixed, so this one stays EAN-13 rather than UPC-A.
        (Symbology::Ean13, "ean13"),
        (Symbology::Ean8, "ean8"),
        (Symbology::Itf, "itf"),
    ] {
        let data = CASES.iter().find(|(s, _, _)| *s == symbology).unwrap().1;
        let png = barcode_png(data, symbology, opts()).unwrap();
        let result = decode_any(DecodeInput::ImageBytes(&png)).unwrap();
        assert_eq!(result.format.as_str(), expected, "{symbology:?}");
    }
}

#[test]
fn qr_still_decodes_through_the_any_format_path() {
    // The point of shipping two decoders is that either can read a QR code —
    // the small one because that is all it does, this one because it does
    // everything.
    let text = "https://example.com/any-format";
    let png = barqr::png(text, barqr::GenerateOptions::default()).unwrap();

    let result = decode_any(DecodeInput::ImageBytes(&png)).unwrap();
    assert_eq!(result.text, text);
    assert_eq!(result.format.as_str(), "qr");
    assert!(
        !result.points.is_empty(),
        "a located symbol should report points"
    );
}

#[test]
fn positions_land_inside_the_image() {
    let png = barcode_png("HELLO-123", Symbology::Code128, opts()).unwrap();
    let m = generate_barcode_modules("HELLO-123", Symbology::Code128, opts()).unwrap();

    let [first] = decode_any_all(DecodeInput::ImageBytes(&png))
        .unwrap()
        .try_into()
        .expect("exactly one symbol");

    for (x, y) in &first.points {
        assert!(
            *x >= 0 && *x <= m.img_width() as i32,
            "x {x} outside the image"
        );
        assert!(*y >= 0 && *y <= m.height as i32, "y {y} outside the image");
    }
}

#[test]
fn oversized_input_is_refused_here_too() {
    let err = decode_any(DecodeInput::Rgba {
        width: 30_000,
        height: 30_000,
        data: &[],
    })
    .unwrap_err();
    assert_eq!(err.code(), "IMAGE_TOO_LARGE");

    let err = decode_any(DecodeInput::ImageBytes(b"not an image")).unwrap_err();
    assert_eq!(err.code(), "INVALID_IMAGE");
}
