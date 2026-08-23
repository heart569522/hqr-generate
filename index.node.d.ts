/* =========================================================
 * barqr — Node / SSR types
 *
 * Same API as the browser entry, but synchronous: the Node build loads WASM at
 * import time, so nothing here returns a Promise. `await` on these values is
 * harmless if you share code between server and client.
 * ======================================================= */

import type {
  BarcodeModules,
  BarcodeOptions,
  BarcodeSvgOptions,
  DecodedQr,
  GenerateOptions,
  QrModules,
  SvgOptions,
} from "./index";

export type {
  BarcodeFormat,
  BarcodeModules,
  BarcodeOptions,
  BarcodeSvgOptions,
  DecodedQr,
  GenerateOptions,
  HqrError,
  HqrErrorCode,
  QrEcc,
  QrModules,
  QrSizeMode,
  SvgOptions,
} from "./index";

/** Generate a QR code as PNG bytes (1-bit grayscale). */
export function qrPng(text: string, opts?: GenerateOptions): Uint8Array;

/** Generate a QR code as SVG markup (a single `<path>`). */
export function qrSvg(text: string, opts?: SvgOptions): string;

/** Generate a 1D barcode as PNG bytes. Digits are not drawn — see {@link barcodeSvg}. */
export function barcodePng(text: string, opts?: BarcodeOptions): Uint8Array;

/** Generate a 1D barcode as SVG, with the data underneath where conventional. */
export function barcodeSvg(text: string, opts?: BarcodeSvgOptions): string;

/** The bar pattern, for drawing the barcode yourself. */
export function barcodeModules(text: string, opts?: BarcodeOptions): BarcodeModules;

/**
 * Encode a batch in one crossing of the JS/WASM boundary. Fails on the first
 * bad entry; the thrown error carries an `index` property.
 */
export function qrMany(texts: string[], opts?: GenerateOptions): Uint8Array[];

/** The raw module grid, for rendering the code yourself. */
export function qrModules(text: string, opts?: GenerateOptions): QrModules;


/**
 * Read a QR code out of encoded image bytes (PNG / JPEG / WebP) or an
 * `ImageData`-shaped `{ width, height, data }`. Loads the decoder WASM module
 * on first use.
 */
export function decode(input: Uint8Array | ImageData): string;

/** Every readable QR code in the image, with the pixel corners of each. */
export function decodeAll(input: Uint8Array | ImageData): DecodedQr[];

/**
 * Present for parity with the browser entry. In Node the encoder is already
 * loaded; pass `{ decoder: true }` to warm the decoder too.
 */
export function ready(opts?: { decoder?: boolean }): Promise<void>;

/** @deprecated use {@link qrSvg} */
