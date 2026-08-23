//! JS bindings.
//!
//! Which functions exist depends on the Cargo features the binary was built
//! with: `generate` exposes the encoders, `decode` exposes `decode`. The npm
//! package ships them as two separate `.wasm` files so a page that only renders
//! QR codes never downloads the decoder.
//!
//! Errors cross the boundary as real JS `Error` objects carrying a stable
//! `code` property (`PAYLOAD_TOO_LONG`, `QR_NOT_FOUND`, ...).
#![cfg(feature = "wasm")]

use js_sys::{Reflect, Uint8Array};
use wasm_bindgen::JsValue;
use wasm_bindgen::prelude::*;
// `is_instance_of` is only used on the decode path.
#[cfg(feature = "decode")]
use wasm_bindgen::JsCast;

#[cfg(feature = "generate")]
use crate::core::generate::generate_qr_modules;
#[cfg(feature = "generate")]
use crate::core::types::{Ecc, GenerateOptions, SizeMode};
#[cfg(feature = "generate")]
use crate::render::png::render_png_modules;
#[cfg(feature = "generate")]
use crate::render::svg::render_svg_modules_with_logo;

#[cfg(feature = "decode")]
use crate::core::decode::{QrResult, decode as core_decode, decode_all as core_decode_all};
#[cfg(feature = "decode")]
use crate::core::types::DecodeInput;

// ---------- errors ----------

/// Build a JS `Error` with a machine-readable `code` property.
fn js_error(code: &str, message: &str) -> JsValue {
    let err = js_sys::Error::new(message);
    // Reflect::set on a fresh Error cannot fail; ignore the Result rather than
    // panicking (a panic here would poison the whole WASM instance).
    let _ = Reflect::set(&err, &JsValue::from_str("code"), &JsValue::from_str(code));
    err.into()
}

#[cfg(feature = "generate")]
fn gen_err(e: crate::error::GenerateError) -> JsValue {
    js_error(e.code(), &e.to_string())
}

#[cfg(feature = "decode")]
fn dec_err(e: crate::error::DecodeError) -> JsValue {
    js_error(e.code(), &e.to_string())
}

#[cfg(feature = "generate")]
#[inline]
fn opts_of(size: u32, margin: u32, ecc: u8, size_mode: u8, logo_space: u8) -> GenerateOptions {
    GenerateOptions {
        size,
        margin,
        ecc: Ecc::from_u8(ecc),
        size_mode: SizeMode::from_u8(size_mode),
        logo_space,
    }
}

#[cfg(any(feature = "generate", feature = "decode"))]
#[inline]
fn set_prop(obj: &js_sys::Object, key: &str, value: JsValue) {
    // Reflect::set on a plain object cannot fail; a panic here would poison the
    // whole WASM instance, so the Result is dropped deliberately.
    let _ = Reflect::set(obj, &JsValue::from_str(key), &value);
}

#[cfg(any(feature = "generate", feature = "decode"))]
#[inline]
fn num(v: u32) -> JsValue {
    JsValue::from_f64(v as f64)
}

// ---------- generate ----------

/// PNG bytes (1-bit grayscale). `ecc`: 0=L 1=M 2=Q 3=H. `size_mode`: 0=exact 1=fit.
#[cfg(feature = "generate")]
#[wasm_bindgen]
pub fn generate_png(
    text: &str,
    size: u32,
    margin: u32,
    ecc: u8,
    size_mode: u8,
    logo_space: u8,
) -> Result<Uint8Array, JsValue> {
    let modules = generate_qr_modules(text, opts_of(size, margin, ecc, size_mode, logo_space))
        .map_err(gen_err)?;
    let bytes = render_png_modules(&modules).map_err(gen_err)?;
    Ok(Uint8Array::from(bytes.as_slice()))
}

/// Encode a whole batch in one call.
///
/// Rendering a table of tickets through `generate_png` pays the JS/WASM
/// boundary once per row; this pays it once for the batch. Fails on the first
/// bad entry, with `err.index` pointing at it.
#[cfg(feature = "generate")]
#[wasm_bindgen]
pub fn generate_many_png(
    texts: Vec<String>,
    size: u32,
    margin: u32,
    ecc: u8,
    size_mode: u8,
    logo_space: u8,
) -> Result<js_sys::Array, JsValue> {
    let opts = opts_of(size, margin, ecc, size_mode, logo_space);
    let out = js_sys::Array::new_with_length(texts.len() as u32);

    for (i, text) in texts.iter().enumerate() {
        let modules = generate_qr_modules(text, opts).map_err(|e| {
            let err = gen_err(e);
            let _ = Reflect::set(&err, &JsValue::from_str("index"), &num(i as u32));
            err
        })?;
        let bytes = render_png_modules(&modules).map_err(gen_err)?;
        out.set(i as u32, Uint8Array::from(bytes.as_slice()).into());
    }

    Ok(out)
}

/// SVG markup (a single `<path>`).
#[cfg(feature = "generate")]
#[wasm_bindgen]
pub fn generate_svg(
    text: &str,
    size: u32,
    margin: u32,
    ecc: u8,
    size_mode: u8,
    logo_space: u8,
    logo_href: Option<String>,
) -> Result<String, JsValue> {
    let modules = generate_qr_modules(text, opts_of(size, margin, ecc, size_mode, logo_space))
        .map_err(gen_err)?;
    Ok(render_svg_modules_with_logo(&modules, logo_href.as_deref()))
}

/// The raw module grid, for callers that render it themselves (canvas, inline
/// `<svg>`, PDF, native).
///
/// Returns a plain JS object — not a wasm-bindgen class — so there is nothing
/// for the caller to `.free()`:
/// `{ n, margin, scale, size, origin, version, dark: Uint8Array }`, where
/// `dark[y * n + x]` is 1 for a dark module and `origin` is the pixel offset of
/// module (0, 0) from the top-left corner of the image.
#[cfg(feature = "generate")]
#[wasm_bindgen]
pub fn generate_modules(
    text: &str,
    size: u32,
    margin: u32,
    ecc: u8,
    size_mode: u8,
    logo_space: u8,
) -> Result<JsValue, JsValue> {
    let m = generate_qr_modules(text, opts_of(size, margin, ecc, size_mode, logo_space))
        .map_err(gen_err)?;

    let dark: Vec<u8> = m.dark.iter().map(|&d| d as u8).collect();

    let obj = js_sys::Object::new();
    set_prop(&obj, "n", num(m.n));
    set_prop(&obj, "margin", num(m.margin));
    set_prop(&obj, "scale", num(m.scale));
    set_prop(&obj, "size", num(m.img_size));
    set_prop(&obj, "origin", num(m.origin_px()));
    set_prop(&obj, "version", num(m.version()));
    set_prop(&obj, "dark", Uint8Array::from(dark.as_slice()).into());

    // Where a logo goes, if space was reserved for one.
    match m.logo_rect_px() {
        Some((x, y, side)) => {
            let rect = js_sys::Object::new();
            set_prop(&rect, "x", num(x));
            set_prop(&rect, "y", num(y));
            set_prop(&rect, "size", num(side));
            set_prop(&rect, "modules", num(m.logo_modules));
            set_prop(&obj, "logo", rect.into());
        }
        None => set_prop(&obj, "logo", JsValue::NULL),
    }

    Ok(obj.into())
}

// ---------- barcode (1D) ----------

#[cfg(feature = "barcode")]
use crate::core::barcode::{
    BarcodeOptions, Symbology, generate_barcode_modules as core_barcode_modules,
};

#[cfg(feature = "barcode")]
fn barcode_parts(
    text: &str,
    symbology: u8,
    module_width: u32,
    height: u32,
    quiet: u32,
) -> Result<crate::core::barcode::BarcodeModules, JsValue> {
    let sym = Symbology::from_u8(symbology).ok_or_else(|| {
        js_error(
            "INVALID_OPTION",
            &format!("unknown barcode symbology {symbology}"),
        )
    })?;
    core_barcode_modules(
        text,
        sym,
        BarcodeOptions {
            module_width,
            height,
            quiet,
        },
    )
    .map_err(gen_err)
}

/// 1D barcode as PNG bytes. `symbology`: see the JS layer's format table.
#[cfg(feature = "barcode")]
#[wasm_bindgen]
pub fn generate_barcode_png(
    text: &str,
    symbology: u8,
    module_width: u32,
    height: u32,
    quiet: u32,
) -> Result<Uint8Array, JsValue> {
    let m = barcode_parts(text, symbology, module_width, height, quiet)?;
    let bytes = crate::render::barcode::render_barcode_png(&m).map_err(gen_err)?;
    Ok(Uint8Array::from(bytes.as_slice()))
}

/// 1D barcode as SVG. `show_text` prints the data under the bars.
#[cfg(feature = "barcode")]
#[wasm_bindgen]
pub fn generate_barcode_svg(
    text: &str,
    symbology: u8,
    module_width: u32,
    height: u32,
    quiet: u32,
    show_text: bool,
) -> Result<String, JsValue> {
    let m = barcode_parts(text, symbology, module_width, height, quiet)?;
    Ok(crate::render::barcode::render_barcode_svg(&m, show_text))
}

/// The bar pattern, for callers rendering it themselves.
/// `{ bars: Uint8Array, moduleWidth, height, quiet, origin, width, text }`.
#[cfg(feature = "barcode")]
#[wasm_bindgen]
pub fn generate_barcode_modules(
    text: &str,
    symbology: u8,
    module_width: u32,
    height: u32,
    quiet: u32,
) -> Result<JsValue, JsValue> {
    let m = barcode_parts(text, symbology, module_width, height, quiet)?;
    let bars: Vec<u8> = m.bars.iter().map(|&b| b as u8).collect();

    let obj = js_sys::Object::new();
    set_prop(&obj, "bars", Uint8Array::from(bars.as_slice()).into());
    set_prop(&obj, "moduleWidth", num(m.module_width));
    set_prop(&obj, "height", num(m.height));
    set_prop(&obj, "quiet", num(m.quiet));
    set_prop(&obj, "origin", num(m.origin_px()));
    set_prop(&obj, "width", num(m.img_width()));
    set_prop(&obj, "text", JsValue::from_str(&m.text));
    Ok(obj.into())
}

// ---------- decode ----------

/// Read a QR code out of `Uint8Array` image bytes (PNG/JPEG/WebP) or an
/// `ImageData`-shaped object `{ width, height, data }`.
#[cfg(feature = "decode")]
#[wasm_bindgen]
pub fn decode(input: JsValue) -> Result<String, JsValue> {
    Ok(with_decode_input(input, core_decode)?.text)
}

/// Normalize the two accepted JS shapes into a [`DecodeInput`] and run `f` over
/// it. The RGBA buffer has to stay alive for the call, which is why this takes
/// a closure instead of returning the input.
#[cfg(feature = "decode")]
fn with_decode_input<T>(
    input: JsValue,
    f: impl FnOnce(DecodeInput) -> Result<T, crate::error::DecodeError>,
) -> Result<T, JsValue> {
    // Case 1: encoded image bytes.
    if input.is_instance_of::<Uint8Array>() {
        let bytes = Uint8Array::new(&input).to_vec();
        return f(DecodeInput::ImageBytes(&bytes)).map_err(dec_err);
    }

    // Case 2: ImageData-like `{ width, height, data }`.
    let width = read_dimension(&input, "width")?;
    let height = read_dimension(&input, "height")?;

    let data = Reflect::get(&input, &JsValue::from_str("data"))
        .map_err(|_| js_error("INVALID_IMAGE", "decode: input has no `data` property"))?;
    if !data.is_object() {
        return Err(js_error(
            "INVALID_IMAGE",
            "decode: expected a Uint8Array or an ImageData-like { width, height, data }",
        ));
    }

    // ImageData.data is a Uint8ClampedArray; Uint8Array::new views the same buffer.
    let rgba = Uint8Array::new(&data).to_vec();

    f(DecodeInput::Rgba {
        width,
        height,
        data: &rgba,
    })
    .map_err(dec_err)
}

/// Decode every readable QR code in the image.
///
/// Returns an array of
/// `{ text, version, eccLevel, corners: [{ x, y } x4] }`, ordered as located.
/// The corners are pixel coordinates in the source image — enough to draw an
/// overlay, or to work out which of several codes the user pointed at.
#[cfg(feature = "decode")]
#[wasm_bindgen]
pub fn decode_all(input: JsValue) -> Result<js_sys::Array, JsValue> {
    let results = with_decode_input(input, core_decode_all)?;

    let out = js_sys::Array::new_with_length(results.len() as u32);
    for (i, r) in results.iter().enumerate() {
        out.set(i as u32, result_to_js(r));
    }
    Ok(out)
}

#[cfg(feature = "decode")]
fn result_to_js(r: &QrResult) -> JsValue {
    let corners = js_sys::Array::new_with_length(4);
    for (i, c) in r.corners.iter().enumerate() {
        let point = js_sys::Object::new();
        set_prop(&point, "x", JsValue::from_f64(c.x as f64));
        set_prop(&point, "y", JsValue::from_f64(c.y as f64));
        corners.set(i as u32, point.into());
    }

    let obj = js_sys::Object::new();
    set_prop(&obj, "text", JsValue::from_str(&r.text));
    set_prop(&obj, "version", num(r.version));
    set_prop(&obj, "eccLevel", num(u32::from(r.ecc_level)));
    set_prop(&obj, "corners", corners.into());
    obj.into()
}

#[cfg(feature = "decode")]
fn read_dimension(input: &JsValue, key: &str) -> Result<u32, JsValue> {
    Reflect::get(input, &JsValue::from_str(key))
        .ok()
        .and_then(|v| v.as_f64())
        .filter(|v| *v > 0.0 && v.fract() == 0.0)
        .map(|v| v as u32)
        .ok_or_else(|| js_error("INVALID_IMAGE", &format!("decode: invalid ImageData.{key}")))
}
