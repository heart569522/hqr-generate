#![cfg(feature = "wasm")]

use js_sys::Uint8Array;
use wasm_bindgen::JsValue;
use wasm_bindgen::prelude::*;

use base64::{Engine as _, engine::general_purpose::STANDARD};

use crate::generate::qr_png_bytes_inner;

#[cfg(feature = "decode")]
use crate::decode::decode_from_rgba;

#[wasm_bindgen]
pub fn qr_png_bytes(text: &str, size: u32, margin: u32, ecc: u8) -> Result<Uint8Array, JsValue> {
    let png = qr_png_bytes_inner(text, size, margin, ecc)
        .map_err(|e| JsValue::from_str(&format!("{:?}", e)))?;

    Ok(Uint8Array::from(png.as_slice()))
}

#[wasm_bindgen]
pub fn qr_png_data_url(text: &str, size: u32, margin: u32, ecc: u8) -> Result<String, JsValue> {
    let png = qr_png_bytes_inner(text, size, margin, ecc)
        .map_err(|e| JsValue::from_str(&format!("{:?}", e)))?;

    Ok(format!("data:image/png;base64,{}", STANDARD.encode(png)))
}

#[cfg(feature = "decode")]
#[wasm_bindgen]
pub fn qr_decode_from_rgba(width: u32, height: u32, rgba: Uint8Array) -> Result<String, JsValue> {
    let rgba = rgba.to_vec();

    decode_from_rgba(width, height, &rgba)
        .map(|r| r.text)
        .map_err(|e| JsValue::from_str(&format!("{:?}", e)))
}
