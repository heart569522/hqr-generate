// Browser / bundler entry (ESM).
//
// Two WASM modules ship in this package. The encoder (~177 KB, ~84 KB gzipped)
// is loaded by `ready()` or the first `generate*` call; the decoder (~721 KB)
// is a separate module that is only fetched if you actually call `decode`.
// Pages that just render QR codes never pay for the decoder.

import init, {
  generate_png as _png,
  generate_svg as _svg,
  generate_modules as _modules,
  generate_many_png as _manyPng,
  generate_barcode_png as _barPng,
  generate_barcode_svg as _barSvg,
  generate_barcode_modules as _barModules,
} from "./pkg/web/barqrcode.js";

import {
  logoHref,
  normalizeBarcodeOpts,
  normalizeOpts,
  showBarcodeText,
} from "./internal/options.js";

let _encoderReady;
let _decoderReady;
let _anyDecoderReady;

function ensureEncoder() {
  return (_encoderReady ??= init());
}

function ensureDecoder() {
  return (_decoderReady ??= import("./pkg/web-decode/barqrcode.js").then(async (mod) => {
    await mod.default();
    return mod;
  }));
}

// A third module, and the largest. It reads every symbology rxing supports, and
// costs roughly twice the QR-only decoder — which is exactly why it is separate:
// a page that only scans QR codes should never fetch it.
function ensureAnyDecoder() {
  return (_anyDecoderReady ??= import("./pkg/web-decode-any/barqrcode.js").then(async (mod) => {
    await mod.default();
    return mod;
  }));
}

/**
 * Warm the WASM modules up front so the first render is not the one that pays
 * for the download. Safe to call repeatedly; work happens once.
 *
 * @param {{ decoder?: boolean }} [opts] also preload the decoder
 * @returns {Promise<void>}
 */
export async function ready(opts) {
  await Promise.all([
    ensureEncoder(),
    opts?.decoder ? ensureDecoder() : null,
    opts?.anyDecoder ? ensureAnyDecoder() : null,
  ]);
}

/**
 * Generate a QR code as PNG bytes (1-bit grayscale).
 *
 * @param {string} text
 * @param {import('./index').GenerateOptions} [opts]
 * @returns {Promise<Uint8Array>}
 */
export async function qrPng(text, opts) {
  const args = normalizeOpts(opts);
  await ensureEncoder();
  return _png(text, ...args);
}

/**
 * Generate a QR code as SVG markup (a single `<path>`).
 *
 * @param {string} text
 * @param {import('./index').GenerateOptions} [opts]
 * @returns {Promise<string>}
 */
export async function qrSvg(text, opts) {
  const args = normalizeOpts(opts);
  const href = logoHref(opts);
  await ensureEncoder();
  return _svg(text, ...args, href);
}

/**
 * Encode a batch in one crossing of the JS/WASM boundary. For a page rendering
 * a table of codes this is meaningfully cheaper than a loop over
 * {@link qrPng}.
 *
 * Fails on the first bad entry; the thrown error carries `index`.
 *
 * @param {string[]} texts
 * @param {import('./index').GenerateOptions} [opts]
 * @returns {Promise<Uint8Array[]>}
 */
export async function qrMany(texts, opts) {
  if (!Array.isArray(texts)) {
    throw new TypeError("qrMany expects an array of strings");
  }
  const args = normalizeOpts(opts);
  await ensureEncoder();
  return _manyPng(texts, ...args);
}

/**
 * The raw module grid, for rendering the code yourself (canvas, inline `<svg>`,
 * PDF, native). `dark[y * n + x]` is 1 for a dark module.
 *
 * @param {string} text
 * @param {import('./index').GenerateOptions} [opts]
 * @returns {Promise<import('./index').QrModules>}
 */
export async function qrModules(text, opts) {
  const args = normalizeOpts(opts);
  await ensureEncoder();
  return _modules(text, ...args);
}


/**
 * Generate a 1D barcode as PNG bytes.
 *
 * The human-readable digits are not drawn — that needs a font, which would cost
 * more binary than everything else here combined. Use {@link barcodeSvg}
 * when the text matters.
 *
 * @param {string} text
 * @param {import('./index').BarcodeOptions} [opts]
 * @returns {Promise<Uint8Array>}
 */
export async function barcodePng(text, opts) {
  const args = normalizeBarcodeOpts(opts);
  await ensureEncoder();
  return _barPng(text, ...args);
}

/**
 * Generate a 1D barcode as SVG, with the data printed underneath when the
 * symbology conventionally does so (EAN and UPC do; Code 128 does not).
 * Override with `text: true | false`.
 *
 * @param {string} text
 * @param {import('./index').BarcodeSvgOptions} [opts]
 * @returns {Promise<string>}
 */
export async function barcodeSvg(text, opts) {
  const args = normalizeBarcodeOpts(opts);
  const withText = showBarcodeText(opts);
  await ensureEncoder();
  return _barSvg(text, ...args, withText);
}

/**
 * The bar pattern, for drawing the barcode yourself.
 *
 * @param {string} text
 * @param {import('./index').BarcodeOptions} [opts]
 * @returns {Promise<import('./index').BarcodeModules>}
 */
export async function barcodeModules(text, opts) {
  const args = normalizeBarcodeOpts(opts);
  await ensureEncoder();
  return _barModules(text, ...args);
}

/**
 * Read a QR code out of image bytes (PNG/JPEG/WebP) or canvas `ImageData`.
 * Loads the decoder WASM module on first use.
 *
 * @param {Uint8Array | ImageData} input
 * @returns {Promise<string>}
 */
export async function decode(input) {
  const mod = await ensureDecoder();
  return mod.decode(input);
}

/**
 * Every readable QR code in the image, with the pixel corners of each one.
 * Useful for overlays, and for images that contain more than one code.
 *
 * @param {Uint8Array | ImageData} input
 * @returns {Promise<import('./index').DecodedQr[]>}
 */
export async function decodeAll(input) {
  const mod = await ensureDecoder();
  return mod.decode_all(input);
}

/**
 * Read a symbol of *any* supported symbology — QR, DataMatrix, Aztec, PDF417
 * and the 1D formats — out of image bytes or `ImageData`.
 *
 * Loads a separate, larger WASM module on first use. If you only ever read QR
 * codes, {@link decode} is a third of the download.
 *
 * @param {Uint8Array | ImageData} input
 * @returns {Promise<string>}
 */
export async function decodeAny(input) {
  const mod = await ensureAnyDecoder();
  return mod.decode_any(input);
}

/**
 * Every symbol in the image, of any supported symbology, each with the format
 * that was recognised and where it sits.
 *
 * @param {Uint8Array | ImageData} input
 * @returns {Promise<import('./index').DecodedSymbol[]>}
 */
export async function decodeAnyAll(input) {
  const mod = await ensureAnyDecoder();
  return mod.decode_any_all(input);
}

