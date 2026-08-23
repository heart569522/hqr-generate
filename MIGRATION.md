# Migration

- [0.6.x → 1.0.0](#migrating-06x--100) — the package was renamed
- [0.5.x → 0.6.0](#migrating-05x--060)

---

## Migrating 0.6.x → 1.0.0

**The package moved to `__NEW_PKG__`.** `@wirunrom/hqr-generate` is deprecated
and will not get further releases.

```bash
npm uninstall @wirunrom/hqr-generate
npm i __NEW_PKG__
```

Then update your imports. Nothing else about them changes:

```diff
- import { generatePng } from "@wirunrom/hqr-generate";
+ import { generatePng } from "__NEW_PKG__";
```

Every subpath keeps its name: `/react`, `/vue`, `/payload`, `/scanner`,
`/web`, `/node`.

### The API is almost entirely unchanged

All eight functions keep their names and signatures — `generate`,
`generatePng`, `generateSvg`, `generateModules`, `generateMany`, `decode`,
`decodeAll`, `ready` — and so does every option: `size`, `margin`, `ecc`,
`sizeMode`, `logoSpace`, `logo`. The five React hooks are untouched.

Three things actually differ.

### 1. The snake_case aliases are gone

```diff
- generate_png(text, opts)
+ generatePng(text, opts)

- generate_svg(text, opts)
+ generateSvg(text, opts)

- generate_modules(text, opts)
+ generateModules(text, opts)
```

They were 0.5 compatibility shims, marked deprecated in 0.6. Carrying something
deprecated into a 1.0 means removing it in 2.0 or never.

### 2. Very large images are refused

Decoding now rejects anything over **40 megapixels** with a new
`IMAGE_TOO_LARGE` code, before allocating for it.

This closes a real hole rather than tightening a limit for its own sake: a
1.2 MB PNG declaring 16000×16000 made 0.6 allocate **976 MB** and spend 2.2 s
of CPU deciding there was no QR code in it. If you decode images a user
uploaded, 0.6 gave them a way to exhaust your memory from a small file.

40 MP is more than any phone camera and most flatbed scans produce. If you were
feeding the decoder something larger, downscale first — a QR code needs a few
hundred pixels across to read, not tens of thousands.

```js
if (err.code === "IMAGE_TOO_LARGE") {
  // downscale through a canvas and retry
}
```

### 3. Vue and Nuxt are supported

New, so nothing to migrate — but if you had written your own composables around
the core API, `__NEW_PKG__/vue` now ships five of them, SSR-safe for Nuxt.

### Rust crate

Only if you depend on the crate rather than the npm package:

- **MSRV is now 1.88**, raised from a declared 1.85 that was never true — the
  `image` crate has required 1.88 for some time, so `--features decode` could
  not have built on 1.85 at all.
- `GenerateError` and `DecodeError` are `#[non_exhaustive]`. Add a `_` arm.
- `DecodeError::ImageTooLarge` is new.
- `render_svg(&QrBitmap)` was removed. It emitted one `<rect>` per module —
  143 KB where `render_svg_modules` produces 5.2 KB for the same code. The rest
  of the 8-bit API (`QrBitmap`, `rasterize`, `render_png`) stays.
- `rqrr` moved 0.7 → 0.10, which fixes a panic reachable from `decode` with
  crafted input. On `wasm32-unknown-unknown` panics abort and cannot be caught,
  so that one was fatal to the whole WASM instance.

### Nothing to do about

Output bytes differ slightly from 0.6 — the decoder converts to luma instead of
RGBA, and dependencies moved. The compatibility policy is explicit that exact
bytes are not API: what is guaranteed is that output decodes to what you
encoded, at the size you asked for.

---

## Migrating 0.5.x → 0.6.0

**Short version: existing code keeps working.** Every 0.5 export still exists
with the same name and the same signature, and no import path changed. What
changes is the *pixel size of the image you get back* — 0.5 quietly returned
something larger than you asked for, and 0.6 returns exactly what you asked
for.

If you render QR codes into a fixed-size box and never compared the output
bytes, upgrading needs no code change at all.

---

## 1. `size` is now the real pixel size (the one thing to check)

0.5 computed the scale from the symbol only and then added the quiet zone
*outside* it:

```
0.5:  image = (modules + 2 * margin) * floor(size / modules)
```

Measured, with the default `margin: 4` and `ecc: "Q"`:

| payload                  | modules | `{ size: 320 }` in 0.5 | in 0.6      |
| ------------------------ | ------- | ---------------------- | ----------- |
| `https://example.com`    | 25      | 396 × 396              | 320 × 320   |
| a 48-char product URL    | 37      | 360 × 360              | 320 × 320   |
| a 1000-char payload      | 141     | 298 × 298              | 320 × 320   |

Note the last row: large payloads came out *smaller* than requested, small ones
much larger. The requested number was never the number you got.

0.6 treats `size` as the edge length of the finished image, quiet zone
included:

```js
const png = await generate("https://example.com", { size: 320 });
// 0.5 → 407 × 407
// 0.6 → 320 × 320
```

Modules still land on whole pixels — nothing is scaled or blurred. The leftover
pixels from integer scaling widen the quiet zone instead, which scanners like.

### What to check

- **`<img width={320} height={320}>` with a 320 px request** — this actually
  gets *better*: the browser is no longer downscaling a 407 px image.
- **Layouts that measured the returned image** — they now see the number they
  asked for.
- **Snapshot tests / cached hashes of PNG bytes** — these will differ. The
  encoded payload is identical; the raster is not.

### If you need the old geometry exactly

Ask for the largest whole-module image that fits, and give it the size 0.5
would have produced:

```js
import { generateModules, generatePng } from "@wirunrom/hqr-generate";

const { n } = await generateModules(text, { ecc: "Q" });
const legacySize = (n + 2 * 4) * Math.max(1, Math.floor(320 / n)); // what 0.5 returned
const png = await generatePng(text, { size: legacySize, sizeMode: "fit" });
```

`sizeMode: "fit"` also stands on its own: it returns the largest whole-module
image that fits inside `size`, with no padding beyond `margin`.

## 2. The 128 px floor is gone

0.5 silently raised any `size` below 128. `{ size: 64 }` now renders 64 px.
(At that size a long payload will be one pixel per module — legible to a
scanner only up close.)

## 3. Errors are real `Error` objects with a `code`

0.5 threw a bare **string** across the WASM boundary, so `err.message` was
`undefined` and `err instanceof Error` was `false`. 0.6 throws an `Error`
carrying a stable, matchable `code`:

```js
try {
  await generate(payload, { ecc: "H" });
} catch (err) {
  if (err.code === "PAYLOAD_TOO_LONG") {
    return generate(payload, { ecc: "L" }); // retry with more capacity
  }
  throw err;
}
```

| code                 | when                                                |
| -------------------- | --------------------------------------------------- |
| `EMPTY_TEXT`         | `text` was `""`                                     |
| `PAYLOAD_TOO_LONG`   | does not fit at this `ecc`                          |
| `INVALID_SIZE`       | `size` is 0 or above 16384                          |
| `INVALID_MARGIN`     | `margin` above 64                                   |
| `INVALID_OPTION`     | unknown `ecc` / `sizeMode`, non-numeric `size`      |
| `ENCODE_FAILED`      | the QR encoder refused the input                    |
| `PNG_FAILED`         | PNG serialization failed                            |
| `QR_NOT_FOUND`       | image was fine, no QR code in it                    |
| `INVALID_IMAGE`      | not an image, or RGBA dimensions did not match      |
| `UNSUPPORTED_FORMAT` | a real image, but not PNG/JPEG/WebP                 |
| `QR_CORRUPT`         | a symbol was located but could not be read          |

`catch (e) { setError(e) }` and `String(err)` keep working. Only code that
compared the thrown value to a literal string needs updating.

## 4. Two things that used to pass silently now throw

- `ecc: "X"` — an unknown level fell back to `Q` in 0.5; it now throws
  `INVALID_OPTION`. Lower-case (`"q"`) is accepted and normalized.
- `generate("")` — now throws `EMPTY_TEXT`.

## 5. Node resolution changed (a fix, not a break)

0.5 listed the `import` condition before `node` in its `exports` map, so a Node
ESM app could load the **browser** build — which tries to `fetch()` its `.wasm`
and fails outside a browser. 0.6 puts `node` first. If you worked around this
by importing `@wirunrom/hqr-generate/web` on the server, you can drop the
workaround.

`engines` is now `node >= 20.19` (the first release where `require()` of an ESM
package works).

Next.js needs no configuration in 0.6. If you added
`serverExternalPackages: ["@wirunrom/hqr-generate"]` to work around 0.5 failing
inside a server component or route handler, **remove it** — with the binary now
inlined the workaround is unnecessary, and it breaks SSR of any client component
that uses the React hooks.

## 6. Deprecated but still exported

`generate_png`, `generate_svg` and `generate_modules` are aliases of the
camelCase names. They still work; the camelCase spelling is preferred.

---

## New in 0.6 (nothing to migrate, just available)

- `sizeMode: "exact" | "fit"`.
- `logoSpace` reserves a centre square for a logo, and `generateSvg` takes a
  `logo` href to draw into it. Rejected with `LOGO_SPACE_TOO_LARGE` when error
  correction could not cover the loss.
- `generateMany(texts, opts)` — batch encoding in one WASM call.
- `decodeAll(input)` — every code in the image, with pixel corners.
- `@wirunrom/hqr-generate/payload` — `wifi`, `mecard`, `vcard`, `mailto`, `sms`,
  `tel`, `geo`, `otpauth`, `promptpay`.
- `@wirunrom/hqr-generate/scanner` — `createScanner`, `listCameras`, plus the
  `useQrScanner` React hook.
- `generateModules(text, opts)` → `{ n, margin, scale, size, origin, version, dark, logo }`,
  the raw grid, for rendering to canvas / inline `<svg>` / PDF yourself.
- `useGenerateModules()` in `@wirunrom/hqr-generate/react`.
- `ready({ decoder })` to preload the WASM up front.
- The decoder is a **separate WASM module**, loaded only when `decode` is first
  called. A page that only generates QR codes downloads 85 KB gzipped instead of
  the 580 KB that 0.5 shipped.
- `@wirunrom/hqr-generate/node` subpath, for forcing the Node build.

---

## Rust crate API (only if you depend on the crate, not the npm package)

- `generate_qr_modules(text, size, margin, ecc)` → `generate_qr_modules(text, GenerateOptions { .. })`.
- `QrModules::img_size()` (method) → `img_size` (field). New: `offset`, `origin_px()`, `version()`.
- `hqr_generate::decode::decode(..)` → `hqr_generate::decode(..)`; the module is
  still reachable at `hqr_generate::core::decode`.
- `GenerateError` / `DecodeError` are now structured, with `Display`,
  `std::error::Error` and `.code()`.
- The `generate` feature now actually gates the encoder. A
  `--no-default-features` build must name the features it wants:
  `--features generate`, `--features decode`, or both.
- Convenience helpers: `hqr_generate::png(text, opts)` and
  `hqr_generate::svg(text, opts)`.
