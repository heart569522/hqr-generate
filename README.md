# barqr

Fast, scan-reliable **QR codes and 1D barcodes** — generate and decode, Rust compiled to WebAssembly, with thin JS, React and Vue wrappers.

- **85 KB gzipped** to generate. The decoder is a separate module, fetched only if you call `decode`.
- Returns raw `Uint8Array` (PNG) or `string` (SVG) — no Base64, no Data URLs
- Same API in the browser, Node and Next.js (client, SSR and route handlers), with **no bundler configuration**
- **Nine 1D symbologies** too — Code 128/39/93/11, Codabar, EAN-8/13, ITF — for +15 KB
- Black & white only, on purpose: scan reliability first

```bash
npm i barqr
```

Node 20.19+. Coming from an earlier release, or from the package this one
continues? [MIGRATION.md](./MIGRATION.md) has the whole list — for most code it
is the import path and nothing else.

---

## Quick start

```js
import { qrPng, qrSvg, barcodePng, decode } from "barqr";

const png = await qrPng("https://example.com", { size: 320 });   // Uint8Array, exactly 320×320
const svg = await qrSvg("https://example.com", { size: 320 });   // '<svg …><path …/></svg>'
const bar = await barcodePng("SKU-0001", { format: "code128" }); // Uint8Array
const text = await decode(png);                                  // 'https://example.com'
```

Every name is `qr*` or `barcode*` — the two symbol families are peers, and the
prefix tells you which one you are calling.

To show it:

```js
const url = URL.createObjectURL(new Blob([png], { type: "image/png" }));
// …and URL.revokeObjectURL(url) when you're done
```

In Node the same imports are **synchronous** — the `exports` map picks a build that loads WASM at import time:

```ts
// app/api/qr/route.ts — note the absence of await
import { qrPng } from "barqr";

export function GET() {
  return new Response(qrPng("https://example.com") as BodyInit, {
    headers: { "content-type": "image/png" },
  });
}
```

---

## API

| | Browser | Node |
| --- | --- | --- |
| `qrPng(text, opts?)` | `Promise<Uint8Array>` | `Uint8Array` |
| `qrSvg(text, opts?)` | `Promise<string>` | `string` |
| `qrModules(text, opts?)` | `Promise<QrModules>` | `QrModules` |
| `qrMany(texts, opts?)` | `Promise<Uint8Array[]>` | `Uint8Array[]` |
| `barcodePng(text, opts?)` | `Promise<Uint8Array>` | `Uint8Array` |
| `barcodeSvg(text, opts?)` | `Promise<string>` | `string` |
| `barcodeModules(text, opts?)` | `Promise<BarcodeModules>` | `BarcodeModules` |
| `decode(input)` | `Promise<string>` | `string` |
| `decodeAll(input)` | `Promise<DecodedQr[]>` | `DecodedQr[]` |
| `ready(opts?)` | `Promise<void>` | `Promise<void>` |

`decode` takes a `Uint8Array` of image bytes (PNG/JPEG/WebP) or a canvas `ImageData`, and loads the decoder on first use — `ready({ decoder: true })` warms it early.

### Options

| Option | Type | Default | |
| --- | --- | --- | --- |
| `size` | `number` | `320` | Output edge in px, **quiet zone included** |
| `margin` | `number` | `4` | Quiet zone in modules (the spec asks for 4) |
| `ecc` | `'L' \| 'M' \| 'Q' \| 'H'` | `'Q'` | Error correction |
| `sizeMode` | `'exact' \| 'fit'` | `'exact'` | Hit `size` exactly, or the largest whole-module image below it |
| `logoSpace` | `number` | `0` | Percent of the width to blank out for a logo |

Modules always land on whole pixels, so codes never come out blurry. Under `'exact'` the pixels left over from integer scaling widen the quiet zone.

### Barcode options

| Option | Type | Default | |
| --- | --- | --- | --- |
| `format` | see below | `'code128'` | Which symbology |
| `moduleWidth` | `number` | `2` | Pixels per narrow bar |
| `height` | `number` | `80` | Bar height in px |
| `quiet` | `number` | `10` | Quiet zone either side, in modules |
| `text` | `boolean` | per format | Print the data under the bars (SVG only) |

`code128` · `code39` · `code39-checksum` · `code93` · `code11` · `codabar` ·
`ean13` · `ean8` · `itf`

```js
await barcodePng(sku, { format: "code128" });
await barcodeSvg("012345678901", { format: "ean13" }); // check digit computed, digits printed
```

A barcode has no square to fit into — the width comes from the data, and you
choose the height. Each symbology **rejects** what it cannot represent rather
than mangling it: Code 39 has no lowercase, EAN-13 needs 12 or 13 digits.

PNG output carries no human-readable digits, because drawing text needs a font
and a font would cost more than everything else here. Use SVG when they matter.

### Errors

Every failure is an `Error` with a `code` you can branch on:

```js
try {
  await qrPng(payload, { ecc: "H" });
} catch (err) {
  if (err.code === "PAYLOAD_TOO_LONG") await qrPng(payload, { ecc: "L" });
}
```

`EMPTY_TEXT` · `PAYLOAD_TOO_LONG` · `INVALID_SIZE` · `INVALID_MARGIN` · `INVALID_OPTION` · `LOGO_SPACE_TOO_LARGE` · `ENCODE_FAILED` · `PNG_FAILED` · `QR_NOT_FOUND` · `INVALID_IMAGE` · `UNSUPPORTED_FORMAT` · `IMAGE_TOO_LARGE` · `QR_CORRUPT`

---

## React & Vue

```tsx
import { useQr } from "barqr/react";

function Ticket({ url }: { url: string }) {
  const { src, error } = useQr(url, { size: 320 });
  if (error) return <p>{String(error)}</p>;
  return <img src={src ?? undefined} width={320} height={320} alt="QR code" />;
}
```

```vue
<script setup>
import { useQr } from "barqr/vue";
const props = defineProps(["url"]);
const { src, error } = useQr(() => props.url, { size: 320 });
</script>

<template>
  <img v-if="src" :src="src" width="320" height="320" alt="QR code" />
</template>
```

Both expose the same five: | QR | Barcode | Both |
| --- | --- | --- |
| `useQr` | `useBarcode` | `useDecode` |
| `useQrSvg` | `useBarcodeSvg` | `useScanner` |
| `useQrModules` | `useBarcodeModules` | |

`useQr` and `useBarcode` return `{ src, bytes, error, loading }` — `src` is a
managed object URL, revoked for you. The `*Svg` pair returns markup, the
`*Modules` pair returns the raw pattern with nothing to clean up.

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
const svg = await qrSvg(url, { ecc: "H", logoSpace: 24, logo: "/logo.svg" });

// PNG: the space is reserved, you composite the image
const { logo } = await qrModules(url, { ecc: "H", logoSpace: 24 });
ctx.drawImage(img, logo.x, logo.y, logo.size, logo.size);
```

</details>

<details>
<summary><b>Camera scanning</b></summary>

```js
import { createScanner } from "barqr/scanner";

const scanner = await createScanner({
  video: document.querySelector("video"),
  onResult: ({ text }) => console.log(text),
});
scanner.stop();
```

Frames come from `requestVideoFrameCallback` where available, downscaled to 640 px, one decode attempt every 120 ms, repeat hits suppressed for 1.5 s — all adjustable. Needs a secure context (https or localhost); rejects with `CAMERA_DENIED` or `CAMERA_UNAVAILABLE`.

In React, `useScanner()` returns a `videoRef` to attach and releases the camera on unmount.

</details>

<details>
<summary><b>Payload builders (Wi-Fi, contacts, PromptPay…)</b></summary>

```js
import { promptpay, wifi } from "barqr/payload";

await qrPng(wifi({ ssid: "Cafe Wi-Fi", password: "hunter2" }));
await qrPng(promptpay({ target: "081-234-5678", amount: 250 }), { ecc: "M" });
```

`wifi` · `mecard` · `vcard` · `mailto` · `sms` · `tel` · `geo` · `otpauth` · `promptpay`

Plain strings, no WASM loaded. Each escapes its own separators — the failure mode otherwise is a code that scans fine and then does nothing. **PromptPay** builds an EMVCo payload (THB) from a mobile number, a 13-digit national/tax ID or a 15-digit e-wallet ID; adding an `amount` switches it from static to dynamic.

</details>

<details>
<summary><b>Rendering the grid yourself</b></summary>

`qrModules` returns the symbol before rasterization — for canvas, an inline `<svg>` that inherits `currentColor`, PDF, or native.

```js
const { n, scale, origin, dark } = await qrModules(text, { size: 240 });

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
| Encoder (QR **and** barcodes) | **100 KB gz** | loaded on first `generate*` or `ready()` |
| Decoder | 280 KB gz | only if you call `decode` |

Generating a typical URL at 320 px takes **~86 µs** and produces a 1.9 KB PNG or a 5.2 KB SVG (Apple Silicon, release + LTO). Run `npm run bench` for the full suite.

---

## Compatibility

What 1.0 promises, so you know what a version bump means.

**Public API** is what the `exports` map names, and only that:
`.`, `/react`, `/vue`, `/payload`, `/scanner`, `/web`, `/node`. Anything reached
another way — `internal/`, `pkg/`, deep paths into the build output — is not
public and can change in a patch.

**Semver:**

- **major** — removing or renaming an export, changing a signature, changing
  what an existing option does, raising the MSRV, dropping a Node or browser
  version
- **minor** — new exports, new options, new error `code`s
- **patch** — fixes, performance, dependency updates

Two deliberate exceptions, both because refusing them would freeze real bugs:

- A **security fix** can change behaviour in a minor release. The 40-megapixel
  decode cap is the shape of this: it made previously-accepted input fail.
- The **exact bytes** of a PNG or SVG are not API. Codec updates and rendering
  improvements change them. What is guaranteed is that the output decodes to
  what you encoded, at the size you asked for.

**Rust:** MSRV is `rust-version` in `Cargo.toml` — currently 1.88, set by the
`image` crate on the decode path — and CI builds every feature set at exactly
that toolchain on every push. Raising it is a major. `GenerateError` and `DecodeError` are `#[non_exhaustive]`,
so new variants are minor — match with a `_` arm.

**Runtimes:** Node per `engines`. Browsers: anything with WebAssembly and ES
modules. The camera scanner additionally needs `getUserMedia`, so a secure
context.

**Deliberate omissions**, so they read as decisions rather than gaps:

- Output is black and white. Colour and module shapes trade scan reliability for
  looks, and this library takes the other side of that trade.
- `decode` returns a `string` while `decodeAll` returns objects. The common case
  is "read the text"; `decodeAll` is there when you want positions, version and
  ECC level.
- `logo` draws only in SVG. PNG reserves the space and you composite. Decoding
  images inside the encoder build is exactly what would take it from 85 KB to
  hundreds.

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
