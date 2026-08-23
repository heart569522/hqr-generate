// Server-side generation: a route handler that streams PNG bytes straight out.
//
// This is the path that was broken before 0.6 — the `exports` map listed
// `import` before `node`, so Node could resolve to the browser build and die
// trying to `fetch()` its own .wasm. If this route returns an image, the
// resolution order is right.
import { qrPng, qrSvg } from "barqr";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const text = params.get("text") ?? "https://example.com";
  const format = params.get("format") ?? "png";
  const size = Number(params.get("size") ?? 320);

  try {
    if (format === "svg") {
      return new Response(qrSvg(text, { size }), {
        headers: { "content-type": "image/svg+xml", "cache-control": "no-store" },
      });
    }

    // Note: no await. The Node build is synchronous.
    const bytes = qrPng(text, { size });
    return new Response(bytes as BodyInit, {
      headers: { "content-type": "image/png", "cache-control": "no-store" },
    });
  } catch (err) {
    const { code, message } = err as { code?: string; message?: string };
    return Response.json({ error: message, code }, { status: 400 });
  }
}
