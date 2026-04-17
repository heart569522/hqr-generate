#![cfg(feature = "wasm")]

use js_sys::Uint8Array;
use wasm_bindgen::JsCast;
use wasm_bindgen::JsValue;
use wasm_bindgen::prelude::*;

#[cfg(feature = "decode")]
use js_sys::Reflect;

use crate::core::generate::generate_qr_modules;
use crate::render::png::render_png_modules;
use crate::render::svg::render_svg_modules;

#[cfg(feature = "decode")]
use crate::core::decode::decode as core_decode;

#[cfg(feature = "decode")]
use crate::core::types::DecodeInput;

// ---------- helpers ----------

#[inline]
fn js_err<E: core::fmt::Debug>(e: E) -> JsValue {
    JsValue::from_str(&format!("{e:?}"))
}

// ---------- generate (default = png bytes) ----------

#[wasm_bindgen]
pub fn generate(text: &str, size: u32, margin: u32, ecc: u8) -> Result<Uint8Array, JsValue> {
    // Module-level → 1-bit PNG path: no 8-bit scaled bitmap allocated.
    let modules = generate_qr_modules(text, size, margin, ecc).map_err(js_err)?;
    let bytes = render_png_modules(&modules).map_err(js_err)?;
    Ok(Uint8Array::from(bytes.as_slice()))
}

#[wasm_bindgen]
pub fn generate_png(text: &str, size: u32, margin: u32, ecc: u8) -> Result<Uint8Array, JsValue> {
    generate(text, size, margin, ecc)
}

#[wasm_bindgen]
pub fn generate_svg(text: &str, size: u32, margin: u32, ecc: u8) -> Result<String, JsValue> {
    // Module-level path: no scaled pixel buffer allocated.
    let modules = generate_qr_modules(text, size, margin, ecc).map_err(js_err)?;
    Ok(render_svg_modules(&modules))
}

// ---------- decode (Uint8Array | ImageData) ----------
// JS side:
//   decode(u8arrayBytes)
//   decode(imageData)

#[cfg(feature = "decode")]
#[wasm_bindgen]
pub fn decode(input: JsValue) -> Result<String, JsValue> {
    // Case 1: Uint8Array (encoded image bytes: PNG/JPG/WEBP/...)
    if input.is_instance_of::<Uint8Array>() {
        let bytes = Uint8Array::new(&input).to_vec();
        let result = core_decode(DecodeInput::ImageBytes(&bytes)).map_err(js_err)?;
        return Ok(result.text);
    }

    // Case 2: ImageData-like object { width, height, data }
    // In browsers, ImageData has: width, height, data (Uint8ClampedArray)
    let width = Reflect::get(&input, &JsValue::from_str("width"))
        .map_err(js_err)?
        .as_f64()
        .ok_or_else(|| JsValue::from_str("decode: invalid ImageData.width"))?
        as u32;

    let height = Reflect::get(&input, &JsValue::from_str("height"))
        .map_err(js_err)?
        .as_f64()
        .ok_or_else(|| JsValue::from_str("decode: invalid ImageData.height"))?
        as u32;

    let data = Reflect::get(&input, &JsValue::from_str("data")).map_err(js_err)?;

    // ImageData.data is Uint8ClampedArray, but Uint8Array::new works (views same buffer)
    let rgba = Uint8Array::new(&data).to_vec();

    let result = core_decode(DecodeInput::Rgba {
        width,
        height,
        data: &rgba,
    })
    .map_err(js_err)?;

    Ok(result.text)
}
