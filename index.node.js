// Node / SSR entry (ESM).
//
// The WASM modules are loaded through `createRequire` rather than `await
// import`, so every export stays synchronous — a Next.js route handler or an
// Express endpoint can return PNG bytes without an extra microtask — and the
// decoder is only read off disk if something actually calls `decode`.

import { createRequire } from "node:module";
import {
  logoHref,
  normalizeBarcodeOpts,
  normalizeOpts,
  showBarcodeText,
} from "./internal/options.js";

const require = createRequire(import.meta.url);
const encoder = require("./pkg/nodejs/barqr.js");

let _decoder;
function decoder() {
  return (_decoder ??= require("./pkg/nodejs-decode/barqr.js"));
}

/**
 * Present for parity with the browser entry, where it preloads WASM. In Node
 * the encoder is already loaded by the time this module is imported.
 *
 * @param {{ decoder?: boolean }} [opts]
 * @returns {Promise<void>}
 */
export async function ready(opts) {
  if (opts?.decoder) decoder();
}

/**
 * Generate a QR code as PNG bytes (1-bit grayscale).
 *
 * @param {string} text
 * @param {import('./index.node').GenerateOptions} [opts]
 * @returns {Uint8Array}
 */
export function qrPng(text, opts) {
  return encoder.generate_png(text, ...normalizeOpts(opts));
}

/**
 * Generate a QR code as SVG markup (a single `<path>`).
 *
 * @param {string} text
 * @param {import('./index.node').GenerateOptions} [opts]
 * @returns {string}
 */
export function qrSvg(text, opts) {
  return encoder.generate_svg(text, ...normalizeOpts(opts), logoHref(opts));
}

/**
 * Encode a batch in one crossing of the JS/WASM boundary. Fails on the first
 * bad entry; the thrown error carries `index`.
 *
 * @param {string[]} texts
 * @param {import('./index.node').GenerateOptions} [opts]
 * @returns {Uint8Array[]}
 */
export function qrMany(texts, opts) {
  if (!Array.isArray(texts)) {
    throw new TypeError("qrMany expects an array of strings");
  }
  return encoder.generate_many_png(texts, ...normalizeOpts(opts));
}

/**
 * The raw module grid, for rendering the code yourself.
 *
 * @param {string} text
 * @param {import('./index.node').GenerateOptions} [opts]
 * @returns {import('./index.node').QrModules}
 */
export function qrModules(text, opts) {
  return encoder.generate_modules(text, ...normalizeOpts(opts));
}


/**
 * Generate a 1D barcode as PNG bytes. The human-readable digits are not drawn;
 * use {@link barcodeSvg} when the text matters.
 *
 * @param {string} text
 * @param {import('./index.node').BarcodeOptions} [opts]
 * @returns {Uint8Array}
 */
export function barcodePng(text, opts) {
  return encoder.generate_barcode_png(text, ...normalizeBarcodeOpts(opts));
}

/**
 * Generate a 1D barcode as SVG, with the data underneath when the symbology
 * conventionally shows it.
 *
 * @param {string} text
 * @param {import('./index.node').BarcodeSvgOptions} [opts]
 * @returns {string}
 */
export function barcodeSvg(text, opts) {
  return encoder.generate_barcode_svg(text, ...normalizeBarcodeOpts(opts), showBarcodeText(opts));
}

/**
 * The bar pattern, for drawing the barcode yourself.
 *
 * @param {string} text
 * @param {import('./index.node').BarcodeOptions} [opts]
 * @returns {import('./index.node').BarcodeModules}
 */
export function barcodeModules(text, opts) {
  return encoder.generate_barcode_modules(text, ...normalizeBarcodeOpts(opts));
}

/**
 * Read a QR code out of image bytes (PNG/JPEG/WebP) or an `ImageData`-shaped
 * `{ width, height, data }` object.
 *
 * @param {Uint8Array | ImageData} input
 * @returns {string}
 */
export function decode(input) {
  return decoder().decode(input);
}

/**
 * Every readable QR code in the image, with the pixel corners of each one.
 *
 * @param {Uint8Array | ImageData} input
 * @returns {import('./index.node').DecodedQr[]}
 */
export function decodeAll(input) {
  return decoder().decode_all(input);
}

