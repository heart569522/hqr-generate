import initWasm, {
  qr_png_data_url as _qr_png_data_url,
} from "./pkg/hqr_generate.js";

let _initPromise;

async function ensureInit() {
  if (!_initPromise) _initPromise = initWasm();
  await _initPromise;
}

export async function qr_png_data_url(text, size = 320, margin = 4, ecc = "Q") {
  await ensureInit();
  return _qr_png_data_url(text, size, margin, ecc);
}
