# @wirunrom/hqr-generate

Fast, scan-reliable **QR code generator and decoder** — Rust compiled to WebAssembly, with thin JS and React wrappers.

- **85 KB gzipped** to generate. The decoder is a separate module, fetched only if you call `decode`.
- Returns raw `Uint8Array` (PNG) or `string` (SVG) — no Base64, no Data URLs
- Same API in the browser, Node and Next.js (client, SSR and route handlers), with **no bundler configuration**
- Black & white only, on purpose: scan reliability first

```bash
npm i @wirunrom/hqr-generate
```

Node 20.19+. Upgrading from 0.5? Your code still works — see [MIGRATION.md](./MIGRATION.md) for the one behavioural change.

---

## Quick start

```js
import { generatePng, generateSvg, decode } from "@wirunrom/hqr-generate";

const png = await generatePng("https://example.com", { size: 320 }); // Uint8Array, exactly 320×320
const svg = await generateSvg("https://example.com", { size: 320 }); // '<svg …><path …/></svg>'
const text = await decode(png);                                      // 'https://example.com'
```

To show it:

```js
const url = URL.createObjectURL(new Blob([png], { type: "image/png" }));
// …and URL.revokeObjectURL(url) when you're done
```

In Node the same imports are **synchronous** — the `exports` map picks a build that loads WASM at import time:

```ts
// app/api/qr/route.ts — note the absence of await
import { generatePng } from "@wirunrom/hqr-generate";

export function GET() {
  return new Response(generatePng("https://example.com") as BodyInit, {
    headers: { "content-type": "image/png" },
  });
}
```

---

## API

| | Browser | Node |
| --- | --- | --- |
| `generatePng(text, opts?)` | `Promise<Uint8Array>` | `Uint8Array` |
| `generateSvg(text, opts?)` | `Promise<string>` | `string` |
| `generateModules(text, opts?)` | `Promise<QrModules>` | `QrModules` |
| `generateMany(texts, opts?)` | `Promise<Uint8Array[]>` | `Uint8Array[]` |
| `decode(input)` | `Promise<string>` | `string` |
| `decodeAll(input)` | `Promise<DecodedQr[]>` | `DecodedQr[]` |
| `ready(opts?)` | `Promise<void>` | `Promise<void>` |

`generate` is an alias of `generatePng`. `decode` takes a `Uint8Array` of image bytes (PNG/JPEG/WebP) or a canvas `ImageData`, and loads the decoder on first use — `ready({ decoder: true })` warms it early.

### Options

| Option | Type | Default | |
| --- | --- | --- | --- |
| `size` | `number` | `320` | Output edge in px, **quiet zone included** |
| `margin` | `number` | `4` | Quiet zone in modules (the spec asks for 4) |
| `ecc` | `'L' \| 'M' \| 'Q' \| 'H'` | `'Q'` | Error correction |
| `sizeMode` | `'exact' \| 'fit'` | `'exact'` | Hit `size` exactly, or the largest whole-module image below it |
| `logoSpace` | `number` | `0` | Percent of the width to blank out for a logo |

Modules always land on whole pixels, so codes never come out blurry. Under `'exact'` the pixels left over from integer scaling widen the quiet zone.

### Errors

Every failure is an `Error` with a `code` you can branch on:

```js
try {
  await generatePng(payload, { ecc: "H" });
} catch (err) {
  if (err.code === "PAYLOAD_TOO_LONG") await generatePng(payload, { ecc: "L" });
}
```

`EMPTY_TEXT` · `PAYLOAD_TOO_LONG` · `INVALID_SIZE` · `INVALID_MARGIN` · `INVALID_OPTION` · `LOGO_SPACE_TOO_LARGE` · `ENCODE_FAILED` · `PNG_FAILED` · `QR_NOT_FOUND` · `INVALID_IMAGE` · `UNSUPPORTED_FORMAT` · `IMAGE_TOO_LARGE` · `QR_CORRUPT`

---

## React & Vue

```tsx
import { useGenerate } from "@wirunrom/hqr-generate/react";

function Ticket({ url }: { url: string }) {
  const { src, error } = useGenerate(url, { size: 320 });
  if (error) return <p>{String(error)}</p>;
  return <img src={src ?? undefined} width={320} height={320} alt="QR code" />;
}
```

```vue
<script setup>
import { useGenerate } from "@wirunrom/hqr-generate/vue";
const props = defineProps(["url"]);
const { src, error } = useGenerate(() => props.url, { size: 320 });
</script>

<template>
  <img v-if="src" :src="src" width="320" height="320" alt="QR code" />
</template>
```

Both expose the same five: `useGenerate` (bytes + a managed object URL) ·
`useGenerateSvg` · `useGenerateModules` (raw grid) · `useDecode` · `useQrScanner`.

React hooks track the individual option fields, so an inline `{ size: 320 }`
doesn't re-run WASM on every render. Vue composables take plain values, refs or
getters anywhere, and clean up on scope disposal.

**Nuxt and SSR**: the composables stay idle on the server and generate after
hydration — `watchEffect` runs during SSR, unlike React's `useEffect`, so this
guard is what keeps a Nuxt page from trying to `fetch()` WASM while rendering.
To put a QR code in the server-rendered HTML instead, call the API directly in a
server route or `useAsyncData`; it is synchronous in Node.

---

## Recipes

<details>
<summary><b>Logo in the centre</b></summary>

`logoSpace` blanks a centred square, as a percent of the symbol width. Error correction rebuilds whatever the logo hides, so a request is **rejected** with `LOGO_SPACE_TOO_LARGE` if it would spend more of that budget than the level can spare, or if the square would reach the finder patterns a scanner needs to locate the code at all. Use `ecc: 'H'`; the ceiling is ~35% there, and lower on small symbols.

```js
// SVG: the logo is drawn for you, fitted inside the reserved square
const svg = await generateSvg(url, { ecc: "H", logoSpace: 24, logo: "/logo.svg" });

// PNG: the space is reserved, you composite the image
const { logo } = await generateModules(url, { ecc: "H", logoSpace: 24 });
ctx.drawImage(img, logo.x, logo.y, logo.size, logo.size);
```

</details>

<details>
<summary><b>Camera scanning</b></summary>

```js
import { createScanner } from "@wirunrom/hqr-generate/scanner";

const scanner = await createScanner({
  video: document.querySelector("video"),
  onResult: ({ text }) => console.log(text),
});
scanner.stop();
```

Frames come from `requestVideoFrameCallback` where available, downscaled to 640 px, one decode attempt every 120 ms, repeat hits suppressed for 1.5 s — all adjustable. Needs a secure context (https or localhost); rejects with `CAMERA_DENIED` or `CAMERA_UNAVAILABLE`.

In React, `useQrScanner()` returns a `videoRef` to attach and releases the camera on unmount.

</details>

<details>
<summary><b>Payload builders (Wi-Fi, contacts, PromptPay…)</b></summary>

```js
import { promptpay, wifi } from "@wirunrom/hqr-generate/payload";

await generatePng(wifi({ ssid: "Cafe Wi-Fi", password: "hunter2" }));
await generatePng(promptpay({ target: "081-234-5678", amount: 250 }), { ecc: "M" });
```

`wifi` · `mecard` · `vcard` · `mailto` · `sms` · `tel` · `geo` · `otpauth` · `promptpay`

Plain strings, no WASM loaded. Each escapes its own separators — the failure mode otherwise is a code that scans fine and then does nothing. **PromptPay** builds an EMVCo payload (THB) from a mobile number, a 13-digit national/tax ID or a 15-digit e-wallet ID; adding an `amount` switches it from static to dynamic.

</details>

<details>
<summary><b>Rendering the grid yourself</b></summary>

`generateModules` returns the symbol before rasterization — for canvas, an inline `<svg>` that inherits `currentColor`, PDF, or native.

```js
const { n, scale, origin, dark } = await generateModules(text, { size: 240 });

for (let y = 0; y < n; y++) {
  for (let x = 0; x < n; x++) {
    if (dark[y * n + x]) ctx.fillRect(origin + x * scale, origin + y * scale, scale, scale);
  }
}
```

`decodeAll` returns every code in an image with its pixel corners, for overlays.

</details>

---

## Size & speed

| | Download | |
| --- | --- | --- |
| Encoder | **85 KB gz** | loaded on first `generate*` or `ready()` |
| Decoder | 280 KB gz | only if you call `decode` |

Generating a typical URL at 320 px takes **~86 µs** and produces a 1.9 KB PNG or a 5.2 KB SVG (Apple Silicon, release + LTO). Run `npm run bench` for the full suite.

---

## Development

Needs a Rust toolchain with `wasm32-unknown-unknown`, plus [`wasm-pack`](https://rustwasm.github.io/wasm-pack/).

```bash
npm run build   # 4 WASM builds, binary inlining, React types
npm test        # 33 Rust tests + 40 package tests
npm run lint    # rustfmt + clippy
npm run size    # bundle size budget (CI fails if a binary bloats)
```

`tests/browser.html` is a browser smoke test — serve over HTTP, WASM won't load from `file://`. [`tests/my-app`](./tests/my-app) is a Next.js fixture that installs the packed tarball and imports by package name; it covers client hooks, SSR, a route handler, and the scanner with a simulated camera.

Architecture notes live in [CLAUDE.md](./CLAUDE.md); the path to 1.0 is in [ROADMAP.md](./ROADMAP.md).

## License

MIT
