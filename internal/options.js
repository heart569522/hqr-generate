// Shared option handling for the web and Node entries.
//
// Single source of truth on purpose: the 0.4/0.5 line shipped a bug where the
// `ecc` string reached WASM untranslated and every level silently became Q.
// One normalizer, used by both entries, is what keeps that from coming back.

/** @typedef {'L'|'M'|'Q'|'H'} Ecc */
/** @typedef {'exact'|'fit'} SizeMode */

const ECC_MAP = { L: 0, M: 1, Q: 2, H: 3 };
const SIZE_MODE_MAP = { exact: 0, fit: 1 };

export const DEFAULTS = Object.freeze({
  size: 320,
  margin: 4,
  ecc: "Q",
  sizeMode: "exact",
  logoSpace: 0,
});

/** Errors carry a `code` so callers can branch without matching on the message. */
export function optionError(message) {
  const err = new Error(message);
  err.code = "INVALID_OPTION";
  return err;
}

function toWholeNumber(value, name) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw optionError(`${name} must be a non-negative finite number, received ${String(value)}`);
  }
  // Layout maths in the browser produces fractions constantly; rounding is
  // friendlier than throwing, and the renderer needs whole pixels anyway.
  return Math.round(n);
}

/**
 * Validate and translate options into the positional argument list the WASM
 * binding expects: `[size, margin, eccCode, sizeModeCode, logoSpace]`.
 *
 * @param {{ size?: number, margin?: number, ecc?: Ecc, sizeMode?: SizeMode, logoSpace?: number }} [opts]
 * @returns {[number, number, number, number, number]}
 */
export function normalizeOpts(opts) {
  if (opts != null && typeof opts !== "object") {
    throw optionError(`options must be an object, received ${typeof opts}`);
  }

  const {
    size = DEFAULTS.size,
    margin = DEFAULTS.margin,
    ecc = DEFAULTS.ecc,
    sizeMode = DEFAULTS.sizeMode,
    logoSpace = DEFAULTS.logoSpace,
  } = opts ?? {};

  const eccKey = String(ecc).toUpperCase();
  const eccCode = ECC_MAP[eccKey];
  if (eccCode === undefined) {
    throw optionError(`ecc must be one of L, M, Q, H — received ${JSON.stringify(ecc)}`);
  }

  const modeKey = String(sizeMode).toLowerCase();
  const modeCode = SIZE_MODE_MAP[modeKey];
  if (modeCode === undefined) {
    throw optionError(`sizeMode must be 'exact' or 'fit' — received ${JSON.stringify(sizeMode)}`);
  }

  const logo = toWholeNumber(logoSpace, "logoSpace");
  if (logo > 255) {
    throw optionError(`logoSpace is a percentage, received ${logoSpace}`);
  }

  return [
    toWholeNumber(size, "size"),
    toWholeNumber(margin, "margin"),
    eccCode,
    modeCode,
    logo,
  ];
}

/**
 * The `logo` href, validated. SVG-only: PNG output reserves the space but the
 * caller composites the image, since we do not decode images in the encoder
 * build (that is what keeps it at 83 KB).
 *
 * @param {{ logo?: string, logoSpace?: number }} [opts]
 * @returns {string | undefined}
 */
export function logoHref(opts) {
  const logo = opts?.logo;
  if (logo == null) return undefined;

  if (typeof logo !== "string" || logo.length === 0) {
    throw optionError("logo must be a non-empty URL or data: URI string");
  }
  if (!opts.logoSpace) {
    throw optionError("logo needs logoSpace to reserve room for it, e.g. { logoSpace: 22 }");
  }
  return logo;
}
