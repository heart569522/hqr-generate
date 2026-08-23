// Nitro route handler returning PNG bytes straight from the Node build.
//
// Nitro bundles this file, which is exactly where the `__dirname` lookup in
// wasm-pack's glue used to fail. If this returns an image, the binary really is
// travelling inside the JS.
import { qrPng, qrSvg } from "barqrcode";

export default defineEventHandler((event) => {
  const query = getQuery(event);
  const text = String(query.text ?? "https://example.com");
  const size = Number(query.size ?? 320);

  try {
    if (query.format === "svg") {
      setHeader(event, "content-type", "image/svg+xml");
      return qrSvg(text, { size });
    }
    setHeader(event, "content-type", "image/png");
    // No await: the Node build is synchronous.
    return qrPng(text, { size });
  } catch (err) {
    const { code, message } = err as { code?: string; message?: string };
    setResponseStatus(event, 400);
    return { error: message, code };
  }
});
