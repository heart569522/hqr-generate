import init, {
  qr_png_data_url as _qr_png_data_url,
} from "./pkg/bundler/hqr_generate.js";

let _initPromise;

async function ensureInit() {
  if (!_initPromise) _initPromise = init();
  await _initPromise;
}

export async function qr_png_data_url(text, size = 320, margin = 4, ecc = "Q") {
  await ensureInit();
  return _qr_png_data_url(text, size, margin, ecc);
}
