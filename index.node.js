// index.node.js (Node / SSR entry)

import * as core from "./pkg/nodejs/hqr_generate.js";

const ECC_MAP = { L: 0, M: 1, Q: 2, H: 3 };

function normalizeOpts(opts) {
  const { size = 320, margin = 4, ecc = "Q" } = opts ?? {};
  const eccCode = ECC_MAP[ecc] ?? 2;
  return [size, margin, eccCode];
}

/**
 * Default generator (PNG)
 */
export function generate(text, opts) {
  return core.generate_png(text, ...normalizeOpts(opts));
}

/**
 * Generate QR as PNG
 */
export function generate_png(text, opts) {
  return core.generate_png(text, ...normalizeOpts(opts));
}

/**
 * Generate QR as SVG
 */
export function generate_svg(text, opts) {
  return core.generate_svg(text, ...normalizeOpts(opts));
}

/**
 * Decode QR
 *
 * @param {Uint8Array | ImageData} input
 */
export function decode(input) {
  return core.decode(input);
}
