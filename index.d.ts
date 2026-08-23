/* =========================================================
 * @wirunrom/hqr-generate — browser / bundler types
 *
 * Everything here is async: the browser build loads WASM lazily.
 * Node gets synchronous signatures from `index.node.d.ts`, selected
 * automatically through the package `exports` map.
 * ======================================================= */

/** Error-correction level. Higher survives more damage, holds less data. */
export type QrEcc = "L" | "M" | "Q" | "H";

/** How `size` maps onto the rendered image. */
export type QrSizeMode = "exact" | "fit";

export interface GenerateOptions {
  /**
   * Edge length of the output image in pixels, **including the quiet zone**.
   *
   * @default 320
   */
  size?: number;

  /**
   * Quiet zone around the symbol, in modules. The QR spec asks for 4; going
   * lower hurts scan reliability.
   *
   * @default 4
   */
  margin?: number;

  /**
   * Error-correction level.
   *
   * @default "Q"
   */
  ecc?: QrEcc;

  /**
   * `"exact"` — the image is exactly `size` x `size` px. Modules stay on whole
   * pixels; leftover pixels widen the quiet zone.
   *
   * `"fit"` — the largest whole-module image that fits inside `size`, so it is
   * usually slightly smaller and carries no padding beyond `margin`.
   *
   * @default "exact"
   */
  sizeMode?: QrSizeMode;

  /**
   * Percentage of the symbol width to blank out in the centre, to make room for
   * a logo. `0` (the default) disables it.
   *
   * Error correction reconstructs whatever the logo covers, so the request is
   * rejected with `LOGO_SPACE_TOO_LARGE` if it would use more of the budget
   * than the chosen `ecc` can spare, or if the square would reach the finder
   * patterns. Roughly: 18% at `L`, 27% at `M`, 35% at `Q`, 35% at `H` — and
   * higher `ecc` leaves more margin for real-world damage.
   */
  logoSpace?: number;
}

export interface SvgOptions extends GenerateOptions {
  /**
   * URL or `data:` URI drawn into the centre square, fitted with
   * `xMidYMid meet`. Requires `logoSpace`.
   *
   * SVG only. For PNG, `logoSpace` reserves the area and you composite the
   * image yourself — decoding images inside the encoder build would multiply
   * its size.
   */
  logo?: string;
}

/** The QR symbol before rasterization. */
export interface QrModules {
  /** Modules per side (21..=177), excluding the quiet zone. */
  n: number;
  /** Quiet zone in modules. */
  margin: number;
  /** Pixels per module. */
  scale: number;
  /** Edge length of the rendered image in px. */
  size: number;
  /**
   * Pixel offset of module (0, 0) from the top-left corner — the quiet zone
   * plus any padding `sizeMode: "exact"` added. Module `(x, y)` covers
   * `[origin + x * scale, origin + (x + 1) * scale)`.
   */
  origin: number;
  /** QR version, 1..=40. */
  version: number;
  /** `dark[y * n + x]` is 1 for a dark module, 0 for light. */
  dark: Uint8Array;
  /** The blanked centre square, when `logoSpace` reserved one. */
  logo: { x: number; y: number; size: number; modules: number } | null;
}

/** One decoded QR code, located in the source image. */
export interface DecodedQr {
  text: string;
  /** QR version, 1..=40. */
  version: number;
  /** Error-correction level as encoded in the symbol (0..=3). */
  eccLevel: number;
  /** Pixel corners: top-left, top-right, bottom-right, bottom-left. */
  corners: { x: number; y: number }[];
}

/**
 * Errors thrown by this package carry a stable `code`.
 *
 * Generate: `EMPTY_TEXT`, `PAYLOAD_TOO_LONG`, `INVALID_SIZE`,
 * `INVALID_MARGIN`, `ENCODE_FAILED`, `PNG_FAILED`, `INVALID_OPTION`.
 * Decode: `QR_NOT_FOUND`, `INVALID_IMAGE`, `UNSUPPORTED_FORMAT`, `QR_CORRUPT`.
 */
export interface HqrError extends Error {
  code: HqrErrorCode;
}

export type HqrErrorCode =
  | "EMPTY_TEXT"
  | "PAYLOAD_TOO_LONG"
  | "INVALID_SIZE"
  | "INVALID_MARGIN"
  | "INVALID_OPTION"
  | "LOGO_SPACE_TOO_LARGE"
  | "ENCODE_FAILED"
  | "PNG_FAILED"
  | "QR_NOT_FOUND"
  | "INVALID_IMAGE"
  | "UNSUPPORTED_FORMAT"
  | "IMAGE_TOO_LARGE"
  | "QR_CORRUPT";

/* =========================================================
 * Generate
 * ======================================================= */

/** Generate a QR code as PNG bytes (1-bit grayscale). */
export function generatePng(text: string, opts?: GenerateOptions): Promise<Uint8Array>;

/** Generate a QR code as SVG markup (a single `<path>`). */
export function generateSvg(text: string, opts?: SvgOptions): Promise<string>;

/**
 * Encode a batch in one crossing of the JS/WASM boundary — cheaper than a loop
 * over {@link generatePng} when rendering many codes at once.
 *
 * Fails on the first bad entry; the thrown error carries an `index` property.
 */
export function generateMany(texts: string[], opts?: GenerateOptions): Promise<Uint8Array[]>;

/** The raw module grid, for rendering the code yourself. */
export function generateModules(text: string, opts?: GenerateOptions): Promise<QrModules>;

/** Alias of {@link generatePng}. */
export function generate(text: string, opts?: GenerateOptions): Promise<Uint8Array>;

/* =========================================================
 * Decode
 * ======================================================= */

/**
 * Read a QR code out of encoded image bytes (PNG / JPEG / WebP) or canvas
 * `ImageData`. Loads the decoder WASM module on first use.
 */
export function decode(input: Uint8Array | ImageData): Promise<string>;

/**
 * Every readable QR code in the image, with the pixel corners of each. Use this
 * for overlays, or for images that may hold more than one code.
 */
export function decodeAll(input: Uint8Array | ImageData): Promise<DecodedQr[]>;

/* =========================================================
 * Lifecycle
 * ======================================================= */

/**
 * Preload the WASM modules so the first render does not pay for the download.
 * Safe to call repeatedly.
 */
export function ready(opts?: { decoder?: boolean }): Promise<void>;

/* =========================================================
 * Deprecated aliases (0.5.x names)
 * ======================================================= */

/** @deprecated use {@link generatePng} */
export function generate_png(text: string, opts?: GenerateOptions): Promise<Uint8Array>;
/** @deprecated use {@link generateSvg} */
export function generate_svg(text: string, opts?: GenerateOptions): Promise<string>;
/** @deprecated use {@link generateModules} */
export function generate_modules(text: string, opts?: GenerateOptions): Promise<QrModules>;
