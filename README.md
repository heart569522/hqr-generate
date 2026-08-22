# @wirunrom/hqr-generate

Fast, scan-reliable **QR code generator and decoder** powered by **Rust + WebAssembly**.

Binary-first: the core returns raw `Uint8Array` (PNG) or `string` (SVG). Base64 and Data URL wrapping are left to the UI layer, so the same API works in the browser, React, Next.js (App Router / SSR / route handlers) and Node.

---

## Features

- High-contrast **black & white only** — scan reliability first
- **1-bit grayscale PNG**, **SVG** as a single compact `<path>`, or the **raw module grid** to render yourself
- `size` means what it says: the output is exactly the pixel size you asked for
- **Centre logo** support, with the error-correction budget checked for you
- QR **decoding** from image bytes (PNG/JPEG/WebP) or canvas `ImageData`, with positions
- **Live camera scanning** — `@wirunrom/hqr-generate/scanner`, or the `useQrScanner` hook
- **Typed payload builders** — Wi-Fi, contacts, `otpauth`, **PromptPay** — `@wirunrom/hqr-generate/payload`
- **The decoder is a separate WASM module** — a page that only generates QR codes never downloads it
- Errors are real `Error` objects with a stable `.code`
- Optional React hooks (`react` is an optional peer dependency)

---

## Installation

```bash
npm i @wirunrom/hqr-generate
```

Node 20.19+ is required. Upgrading from 0.5? See [MIGRATION.md](./MIGRATION.md) —
existing code keeps working, but the returned image is now the size you asked for.

---

## Quick start

```js
import { generatePng, generateSvg, decode } from "@wirunrom/hqr-generate";

const png = await generatePng("https://example.com", { size: 320 });
// -> Uint8Array, a 320 x 320 PNG

const svg = await generateSvg("https://example.com", { size: 320 });
// -> '<svg ...><path .../></svg>'

const text = await decode(png);
// -> 'https://example.com'
```

In Node the same imports are **synchronous** — the package `exports` map selects
a Node build that loads WASM at import time:

```js
import { generatePng } from "@wirunrom/hqr-generate";

export function GET() {
  return new Response(generatePng("https://example.com"), {
    headers: { "content-type": "image/png" },
  });
}
```

---

## Next.js

No bundler configuration. All three usages work out of the box:

```tsx
// Server Component — the SVG is in the HTML. No client JS, no layout shift.
import { generateSvg } from "@wirunrom/hqr-generate";

export default function Page() {
  const svg = generateSvg("https://example.com", { size: 240 });
  return <div dangerouslySetInnerHTML={{ __html: svg }} />;
}
```

```ts
// Route Handler — PNG bytes straight out. Note: no await, the Node build is sync.
import { generatePng } from "@wirunrom/hqr-generate";

export function GET() {
  return new Response(generatePng("https://example.com") as BodyInit, {
    headers: { "content-type": "image/png" },
  });
}
```

```tsx
// Client Component — hooks, async under the hood.
"use client";
import { useGenerate } from "@wirunrom/hqr-generate/react";
```

Most WASM packages need `serverExternalPackages` here, because wasm-pack's Node
glue locates its binary with `readFileSync(__dirname + "/…")` and bundling that
module rewrites `__dirname`. This one does not: the Node binary is inlined at
build time, so there is no path to break — in Next, in a serverless bundle, or
anywhere else. That matters beyond convenience, because externalizing the
package would give its React hooks their own copy of `react` and every client
component using them would fail during SSR.

`tests/my-app` is a Next.js app covering all of the above; see
[Development](#development).

---

## API

| Function                          | Returns (browser)       | Returns (Node)  |
| --------------------------------- | ----------------------- | --------------- |
| `generatePng(text, options?)`     | `Promise<Uint8Array>`   | `Uint8Array`    |
| `generateSvg(text, options?)`     | `Promise<string>`       | `string`        |
| `generateModules(text, options?)` | `Promise<QrModules>`    | `QrModules`     |
| `generateMany(texts, options?)`   | `Promise<Uint8Array[]>` | `Uint8Array[]`  |
| `decode(input)`                   | `Promise<string>`       | `string`        |
| `decodeAll(input)`                | `Promise<DecodedQr[]>`  | `DecodedQr[]`   |
| `ready(options?)`                 | `Promise<void>`         | `Promise<void>` |

`generate` is an alias of `generatePng`. The 0.5 snake_case names
(`generate_png`, `generate_svg`) still resolve.

`decode` accepts a `Uint8Array` of encoded image bytes (PNG / JPEG / WebP) or a
canvas `ImageData`. It loads the decoder WASM module on first use; call
`ready({ decoder: true })` to warm it up ahead of time.

### `GenerateOptions`

| Option     | Type                       | Default   | Description                                     |
| ---------- | -------------------------- | --------- | ----------------------------------------------- |
| `size`     | `number`                   | `320`     | Output edge length in px, quiet zone included   |
| `margin`   | `number`                   | `4`       | Quiet zone in modules (the spec asks for 4)     |
| `ecc`      | `'L' \| 'M' \| 'Q' \| 'H'` | `'Q'`     | Error correction level                          |
| `sizeMode` | `'exact' \| 'fit'`         | `'exact'` | Hit `size` exactly, or the largest fit below it |
| `logoSpace`| `number`                   | `0`       | Percent of the width to blank out for a logo    |

`'exact'` gives you a `size` x `size` image. Modules always land on whole pixels
— never scaled or blurred — and the pixels left over from integer scaling widen
the quiet zone, which scanners prefer. `'fit'` returns the largest whole-module
image that fits inside `size` instead, with no padding beyond `margin`.

### Errors

Every failure is an `Error` with a `code` you can branch on:

```js
try {
  await generatePng(payload, { ecc: "H" });
} catch (err) {
  if (err.code === "PAYLOAD_TOO_LONG") {
    await generatePng(payload, { ecc: "L" }); // more capacity
  }
}
```

`EMPTY_TEXT`, `PAYLOAD_TOO_LONG`, `INVALID_SIZE`, `INVALID_MARGIN`,
`INVALID_OPTION`, `LOGO_SPACE_TOO_LARGE`, `ENCODE_FAILED`, `PNG_FAILED`,
`QR_NOT_FOUND`, `INVALID_IMAGE`, `UNSUPPORTED_FORMAT`, `QR_CORRUPT`.

### Logo in the centre

`logoSpace` blanks a centred square, as a percentage of the symbol width. Error
correction reconstructs whatever the logo hides, so the request is **rejected**
with `LOGO_SPACE_TOO_LARGE` if it would spend more of that budget than the level
can spare, or if the square would reach the finder patterns a scanner needs to
locate the code at all. Practical ceilings: 18% at `L`, 27% at `M`, 35% at `Q`
and `H` — and a higher level leaves more headroom for glare and creases, so
`ecc: 'H'` is the right default here.

```js
// SVG: the logo is drawn for you, fitted inside the reserved square.
const svg = await generateSvg(url, { ecc: "H", logoSpace: 24, logo: "/logo.svg" });

// PNG: the space is reserved, you composite the image.
const { logo } = await generateModules(url, { ecc: "H", logoSpace: 24 });
ctx.drawImage(img, logo.x, logo.y, logo.size, logo.size);
```

PNG output does not embed the logo itself, because decoding images inside the
encoder build is exactly what would take it from 85 KB back to hundreds.

### Decoding with positions

`decodeAll` returns every code in the image along with its pixel corners —
enough to draw an overlay, or to work out which of several codes the user meant.

```js
for (const { text, corners } of await decodeAll(imageData)) {
  drawOutline(corners); // [top-left, top-right, bottom-right, bottom-left]
}
```

### Rendering it yourself

`generateModules` returns the grid before rasterization, so you can draw into a
canvas, emit an inline `<svg>` that inherits `currentColor`, or hand the data to
a PDF or native renderer:

```js
const { n, scale, size, origin, dark } = await generateModules(text, { size: 240 });

ctx.fillStyle = "#000";
for (let y = 0; y < n; y++) {
  for (let x = 0; x < n; x++) {
    if (dark[y * n + x]) {
      ctx.fillRect(origin + x * scale, origin + y * scale, scale, scale);
    }
  }
}
```

---

## Payload builders

`@wirunrom/hqr-generate/payload` is pure string building — no WASM is loaded.

```js
import { promptpay, wifi, mecard, otpauth } from "@wirunrom/hqr-generate/payload";

await generatePng(wifi({ ssid: "Cafe Wi-Fi", password: "hunter2" }));
await generatePng(promptpay({ target: "081-234-5678", amount: 250 }), { ecc: "M" });
```

`wifi`, `mecard`, `vcard`, `mailto`, `sms`, `tel`, `geo`, `otpauth`, `promptpay`.

Each one escapes its own separators, which is the part that silently breaks
hand-rolled payloads: an SSID containing `;` splits the record, and a PromptPay
payload with a wrong CRC scans perfectly and then does nothing.

**PromptPay** builds an EMVCo merchant-presented payload (THB). `target` takes a
mobile number, a 13-digit national/tax ID, or a 15-digit e-wallet ID; pass
`type` to disambiguate. An `amount` switches the point-of-initiation tag from
static (`11`) to dynamic (`12`). The structure and its CRC-16/CCITT-FALSE
checksum are covered by tests; verify against your own bank app before going to
production.

---

## Camera scanning

```js
import { createScanner } from "@wirunrom/hqr-generate/scanner";

const scanner = await createScanner({
  video: document.querySelector("video"),
  onResult: ({ text }) => console.log(text),
});
// later
scanner.stop();
```

Frames are pulled with `requestVideoFrameCallback` where available, downscaled
to 640 px before decoding, throttled to one attempt every 120 ms, and repeated
hits on the same text are suppressed for 1.5 s. All four are options. Decoding
runs on the main thread — raise `scanIntervalMs` before reaching for a worker.

Needs a secure context (https or localhost). Rejects with `CAMERA_DENIED` or
`CAMERA_UNAVAILABLE`.

---

## React

```tsx
import {
  useGenerate,
  useGenerateSvg,
  useGenerateModules,
  useDecode,
  useQrScanner,
} from "@wirunrom/hqr-generate/react";

function Ticket({ url }: { url: string }) {
  const { src, loading, error } = useGenerate(url, { size: 320 });

  if (error) return <p>{String(error)}</p>;
  return <img src={src ?? undefined} width={320} height={320} alt="QR code" />;
}
```

- `useGenerate` — PNG bytes plus a ready-to-use object URL (`src`), revoked on cleanup
- `useGenerateSvg` — SVG markup plus an object URL
- `useGenerateModules` — the raw grid, with no Blob or URL lifetime to manage
- `useDecode` — takes `ImageData`
- `useQrScanner` — camera scanning; returns a `videoRef` to attach and releases the camera on unmount

```tsx
function Scanner() {
  const { videoRef, result, error } = useQrScanner({ onResult: (r) => console.log(r.text) });
  if (error) return <p>{String(error)}</p>;
  return (
    <>
      <video ref={videoRef} playsInline muted />
      {result && <p>{result.text}</p>}
    </>
  );
}
```

The hooks track the individual option fields rather than the `opts` object, so
an inline `{ size: 320 }` does not re-run WASM on every render.

---

## Bundle size

The encoder and decoder are separate WASM modules. Loading is lazy on both
sides: nothing is fetched until the first call (or `ready()`), and the decoder
is only fetched if you call `decode`.

| Module                        | Raw    | Gzipped   |
| ----------------------------- | ------ | --------- |
| Encoder (`generate*`)         | 178 KB | **85 KB** |
| Decoder (`decode*`, opt-in)   | 597 KB | 280 KB    |
| `/payload` (opt-in, plain JS) | 11 KB  | 4 KB      |
| `/scanner` (opt-in, plain JS) | 6 KB   | 2 KB      |
| `/react` hooks                | 9 KB   | 2 KB      |

Those are the browser numbers — what a visitor actually downloads. The Node
builds carry the same binaries inlined as base64, which costs about 30% more on
disk and almost nothing after gzip; nothing is fetched over a network there.

For comparison, 0.5.0 shipped a single 1.4 MB binary (580 KB gzipped) that every
page had to download, encoder and decoder together, because the `image` crate
was pulled in with every codec it supports — TIFF, DDS, OpenEXR, HDR and the
rest — none of which a QR scanner ever sees.

`npm run size` prints this table and fails if a binary crosses its budget; CI
runs it on every push.

---

## Performance

Benchmarked on Apple Silicon (release + LTO), typical URL payload at `size: 320`:

| Pipeline                        | Time   | Output size |
| ------------------------------- | ------ | ----------- |
| `generatePng` → 1-bit PNG       | ~86 µs | 1.9 KB      |
| `generateSvg` → single `<path>` | ~86 µs | 5.2 KB      |

Most of that is the QR encoding itself (~65 µs); rendering costs ~20 µs for PNG
and ~8 µs for SVG. For comparison, the legacy 8-bit raster path takes ~124 µs
and produces a larger file, and the pre-0.5 per-module `<rect>` SVG was 143 KB
against today's 5.2 KB.

Behind the numbers: QR encoding via [`fast_qr`](https://crates.io/crates/fast_qr),
rasterization straight into a 1-bit PNG scanline buffer (no 8-bit intermediate),
run-length-merged SVG subpaths with relative commands, and a decoder that
computes luminance inside the `rqrr` callback rather than materializing a
grayscale buffer.

Run the suite with `npm run bench`.

---

## Development

Requires a Rust toolchain with the `wasm32-unknown-unknown` target, plus
[`wasm-pack`](https://rustwasm.github.io/wasm-pack/).

```bash
npm run build        # 4 WASM builds, binary inlining, React types
npm test             # cargo tests + package smoke tests
npm run lint         # rustfmt + clippy
npm run size         # bundle size budget
npm run bench        # criterion benchmarks
```

`tests/browser.html` is a browser smoke test for the local build — serve the
repo over HTTP (WASM will not load from `file://`) and open it.

`tests/my-app` is a Next.js app that consumes the package the way a user does —
through the `exports` map, from an installed tarball rather than a relative
path, which is the only way to catch resolution and bundling problems. It covers
client hooks, a Server Component, a Route Handler and the camera scanner:

```bash
npm run build && npm pack --ignore-scripts
cd tests/my-app
npm install && npm install ../../wirunrom-hqr-generate-0.6.0.tgz
npm run dev
```

Then open `/` (client checks), `/ssr` (server rendering), `/api/qr?text=hi`
(route handler) and `/scan`.

`/scan` has a **simulated camera** button: it feeds the scanner a
`canvas.captureStream()`, which is a real `MediaStream`, so the whole path —
frame pump, downscale, decode, de-duplication, teardown — runs on a machine with
no camera. For the real thing on a phone you need https (a tunnel, or
`next dev --experimental-https`).

Re-run the two install lines after every `npm pack` — npm copies the tarball
contents, it does not link them.

### Cargo features

| Feature    | Contents                                          |
| ---------- | ------------------------------------------------- |
| `generate` | QR encoding + PNG/SVG rendering (default)         |
| `decode`   | QR decoding (`image` + `rqrr`)                    |
| `wasm`     | JS bindings for whichever of the above are on     |

The npm package builds `wasm,generate` and `wasm,decode` separately — that
separation is what keeps the encoder at 85 KB.

---

## License

MIT
