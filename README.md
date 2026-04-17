# @wirunrom/hqr-generate

Fast, scan-reliable **QR code generator and decoder** powered by **Rust + WebAssembly**.

Binary-first: core APIs return raw `Uint8Array` (PNG) or `string` (SVG). Rendering and Blob conversion are handled at the UI layer, so the library works identically in the browser, React, Next.js (App Router / SSR / Route Handlers), and Node.js.

---

## Features

- High-contrast **black & white only** — scan reliability first
- **1-bit grayscale PNG** output — tiny payloads
- **SVG** emitted as a single compact `<path>` — resolution-independent
- QR **decoding** from `Uint8Array` or browser `ImageData`
- Optional React hooks (`react` is an optional peer dep)

---

## Performance

Sub-millisecond end-to-end generation on modern hardware. Benchmarked on Apple Silicon (release + LTO) for a typical URL payload at `size: 320`:

| Pipeline                  | Time   | Output size |
| ------------------------- | ------ | ----------- |
| `generate` → 1-bit PNG    | ~96 µs | ~5.5 KB     |
| `generate_svg` → `<path>` | ~90 µs | ~5.2 KB     |

Behind the numbers: QR encoding via [`fast_qr`](https://crates.io/crates/fast_qr), direct rasterization into a 1-bit PNG buffer (no 8-bit intermediate), run-length-merged SVG subpaths with relative commands, and React hooks that track primitive option fields so inline `opts` don't re-trigger WASM on every render.

Run the suite locally with `cargo bench --bench generate`.

---

## Installation

```bash
npm i @wirunrom/hqr-generate
# or: yarn add / pnpm i
```

---

## API

| Function                       | Parameters                                    | Returns                     |
| ------------------------------ | --------------------------------------------- | --------------------------- |
| `generate(text, options?)`     | `text: string`, `options?: GenerateOptions`   | `Promise<Uint8Array>` (PNG) |
| `generate_svg(text, options?)` | `text: string`, `options?: GenerateOptions`   | `Promise<string>` (SVG)     |
| `decode(input)`                | `input: Uint8Array \| ImageData`              | `Promise<string>`           |

### `GenerateOptions`

| Option   | Type                       | Default | Description                   |
| -------- | -------------------------- | ------- | ----------------------------- |
| `size`   | `number`                   | `320`   | Output image size (px)        |
| `margin` | `number`                   | `4`     | Quiet zone / margin (modules) |
| `ecc`    | `'L' \| 'M' \| 'Q' \| 'H'` | `'Q'`   | Error correction level        |

PNG output is raw bytes (`Uint8Array`), SVG output is plain markup (`string`). No Base64 or Data URL wrapping.

---

## Usage

### React (client-side)

The `/react` entry provides hooks that call the core API, wrap the result in a `Blob URL`, and revoke it on cleanup.

```tsx
"use client";
import { useGenerate, useGenerateSvg } from "@wirunrom/hqr-generate/react";

export function PngQr() {
  const { src, loading } = useGenerate("hello world", { size: 320, ecc: "Q" });
  if (loading) return <p>Loading…</p>;
  return <img src={src ?? ""} alt="QR" />;
}

export function SvgQr() {
  const { src, svg, loading } = useGenerateSvg("hello svg", { size: 320 });
  if (loading) return <p>Loading…</p>;
  return <img src={src ?? ""} alt="QR" />; // or render `svg` inline
}
```

Both hooks return `{ src, bytes|svg, loading, error }`.

### Next.js SSR / Route Handlers

Return the raw PNG bytes directly — no Base64.

```ts
import { generate } from "@wirunrom/hqr-generate";

export async function GET() {
  const bytes = await generate("hello ssr");
  return new Response(bytes, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=60",
    },
  });
}
```

To generate on the server and render on the client, pass bytes to a client component and convert to a `Blob URL` there:

```tsx
// ClientQr.tsx
"use client";
import { useEffect, useState } from "react";

export default function ClientQr({ bytes }: { bytes: Uint8Array }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    const url = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [bytes]);
  return <img src={src} alt="QR" />;
}
```

### Decoding

```tsx
"use client";
import { useDecode } from "@wirunrom/hqr-generate/react";

export default function DecodeQr({ imageData }: { imageData: ImageData }) {
  const { text, loading, error } = useDecode(imageData);
  if (loading) return <p>Decoding…</p>;
  if (error) return <p>Failed to decode</p>;
  return <p>{text}</p>;
}
```

`useDecode` accepts **`ImageData` only**. If you have PNG bytes or a URL, draw them to a canvas first and call `ctx.getImageData(...)`. The core `decode()` also accepts raw `Uint8Array` (PNG/JPG/WebP) — use that for server-side decoding.

### Vanilla JS

ES modules over HTTP (WASM won't load from `file://`):

```html
<script type="module">
  import { generate, generate_svg, decode } from "https://esm.sh/@wirunrom/hqr-generate";

  // PNG
  const bytes = await generate("hello", { size: 256 });
  const url = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
  document.querySelector("img").src = url;

  // SVG
  document.querySelector("#svg").innerHTML = await generate_svg("hello");

  // Decode (from a canvas ImageData or raw PNG/JPG Uint8Array)
  // const text = await decode(imageData);
</script>
```

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).
