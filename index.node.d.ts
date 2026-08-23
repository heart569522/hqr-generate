/* =========================================================
 * @wirunrom/hqr-generate — Node / SSR types
 *
 * Same API as the browser entry, but synchronous: the Node build loads WASM at
 * import time, so nothing here returns a Promise. `await` on these values is
 * harmless if you share code between server and client.
 * ======================================================= */

import type { DecodedQr, GenerateOptions, QrModules, SvgOptions } from "./index";

export type {
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
export function generatePng(text: string, opts?: GenerateOptions): Uint8Array;

/** Generate a QR code as SVG markup (a single `<path>`). */
export function generateSvg(text: string, opts?: SvgOptions): string;

/**
 * Encode a batch in one crossing of the JS/WASM boundary. Fails on the first
 * bad entry; the thrown error carries an `index` property.
 */
export function generateMany(texts: string[], opts?: GenerateOptions): Uint8Array[];

/** The raw module grid, for rendering the code yourself. */
export function generateModules(text: string, opts?: GenerateOptions): QrModules;

/** Alias of {@link generatePng}. */
export function generate(text: string, opts?: GenerateOptions): Uint8Array;

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

/** @deprecated use {@link generateSvg} */
