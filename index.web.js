import init, {
  generate_png as _generate_png,
  generate_svg as _generate_svg,
  decode as _decode,
} from "./pkg/web/hqr_generate.js";

let _initPromise;

/** @returns {Promise<void>} */
async function ensureInit() {
  _initPromise ??= init();
  return _initPromise;
}

const ECC_MAP = { L: 0, M: 1, Q: 2, H: 3 };

function normalizeOpts(opts) {
  const { size = 320, margin = 4, ecc = "Q" } = opts ?? {};
  const eccCode = ECC_MAP[ecc] ?? 2;
  return [size, margin, eccCode];
}

/**
 * Default QR generator (PNG, fastest)
 *
 * @param {string} text
 * @param {object} [opts]
 * @returns {Promise<Uint8Array>}
 */
export async function generate(text, opts) {
  await ensureInit();
  return _generate_png(text, ...normalizeOpts(opts));
}

/**
 * Generate QR as PNG
 */
export async function generate_png(text, opts) {
  await ensureInit();
  return _generate_png(text, ...normalizeOpts(opts));
}

/**
 * Generate QR as SVG
 */
export async function generate_svg(text, opts) {
  await ensureInit();
  return _generate_svg(text, ...normalizeOpts(opts));
}

/**
 * Decode QR from ImageData (Canvas / Browser)
 *
 * @param {ImageData} image
 * @returns {Promise<string>}
 */
export async function decode(image) {
  await ensureInit();
  return _decode(image);
}
