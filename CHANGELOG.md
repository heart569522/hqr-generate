## [Unreleased] — 1.0.0

### Renamed

The package moves to a new name at 1.0. `barqr` is deprecated
and 0.6.0 is its last release; see [MIGRATION.md](./MIGRATION.md). For most code
the whole change is the import path — every function, option and hook keeps its
name.

`scripts/rename.mjs` performs the rename across the repo, since the old name
appears in 23 files for npm alone and 39 once the crate and repo are included.


### Security

- **Fixed a reachable panic in the decoder.** Fuzzing found RGBA input that
  panicked inside `rqrr` 0.7.1: `Perspective::map` asserts that its result fits
  in an `i32`, but that value is computed from image data — a degenerate
  transform drives the denominator toward zero and the coordinate to infinity or
  NaN, and the assertion fires.

  This is worse here than an ordinary dependency bug, because
  `wasm32-unknown-unknown` has `panic-strategy: abort`: a panic anywhere in the
  decode path takes the whole WASM instance with it, and **cannot be caught**.
  One crafted image would end QR decoding for the rest of the page's life, or
  for a server handler's request.

  `rqrr` is upgraded 0.7 -> 0.10, which no longer reaches that state. The input
  is kept as a regression test. Note that the assertion is still present
  upstream, so the defence is keeping the dependency current and continuing to
  fuzz — there is no way to catch it from our side.

- **The decoder no longer trusts an image's declared size.** A compressed image
  describes a canvas rather than containing one: a 1.2 MB PNG claiming
  16000x16000 made the decoder allocate **976 MB** and spend 2.2 s of CPU before
  concluding there was no QR code — roughly an 800x amplification from a file
  anyone could upload. `image`'s own `max_alloc` limit did not prevent it,
  because the largest allocation was this crate's `to_rgba8()` call, which that
  accounting never sees.

  Dimensions are now checked against the header before any pixels are read, and
  anything over 40 megapixels is refused with the new `IMAGE_TOO_LARGE` code, in
  well under a millisecond and with nothing allocated. The same cap applies to
  raw RGBA input, where the caller supplies the dimensions directly, and to
  lopsided canvases that would slip under a pixels-only budget.

  40 MP leaves room for any phone camera and most flatbed scans. A QR code needs
  a few hundred pixels across to read, not tens of thousands.

### Removed

- **The 0.5 snake_case aliases** `generate_png`, `generate_svg` and
  `generate_modules`. Carrying something marked `@deprecated` into a 1.0 means
  removing it in 2.0 or never; this picks. A test now pins the exported surface
  so nothing creeps back in.
- **`render_svg(&QrBitmap)`**, which emitted one `<rect>` per module — 143 KB
  against the 5.2 KB the path renderer produces for the same code. Nothing
  should have been calling it. The 8-bit raster API it belonged to
  (`QrBitmap`, `rasterize`, `render_png`) stays: getting pixels is a real thing
  to want, and the docs no longer call it "legacy".

### Changed

- **Decoding converts to luma instead of RGBA** — a quarter of the memory, and
  faster on legitimate images too (16 MP: 128 ms -> 101 ms, 61 MB -> 15 MB). The
  colour channels were collapsed to luminance on the very next line anyway.
- `GenerateError` and `DecodeError` are now `#[non_exhaustive]`, so adding a
  failure mode after 1.0 will not be a breaking change for Rust consumers. Match
  with a `_` arm.
- The opt-in decoder binary grew by ~9 KB gzipped, which is the cost of the
  bounded reader.

### Added

- **1D barcodes.** Nine symbologies — Code 128, Code 39 (with or without check
  character), Code 93, Code 11, Codabar, EAN-8, EAN-13 and ITF — as PNG, SVG or
  the raw bar pattern, through `generateBarcodePng` / `generateBarcodeSvg` /
  `generateBarcodeModules`, plus `useBarcode` and `useBarcodeSvg` in both the
  React and Vue layers.

  The encoder grows from 85 KB to 100 KB gzipped for all nine, because a 1D
  symbology is lookup tables and bit patterns next to the Reed-Solomon and
  masking machinery QR needs. It rides the same renderers: whole pixels per
  module, runs merged before they reach the encoder.

  Each format **rejects** data it cannot represent rather than mangling it —
  Code 39 has no lowercase, EAN-13 needs 12 or 13 digits — with a new
  `INVALID_BARCODE_DATA` code naming the symbology. EAN computes its check digit
  when given 12 digits, and the printed text includes it, so the digits under
  the bars always agree with the bars.

  SVG prints the human-readable data where the symbology conventionally shows
  it (EAN and UPC do, Code 128 does not); PNG does not, because drawing text
  means shipping a font, which would cost more than everything else in the
  binary.

- **Vue composables** — `barqr/vue`, the same five the React
  layer exposes. Values, refs and getters are all accepted, and everything is
  released on scope disposal.

  They are guarded for SSR, which matters more in Vue than it does in React:
  `watchEffect` runs during server rendering while `useEffect` does not, so an
  unguarded composable would try to `fetch()` the WASM binary mid-render and
  take down every Nuxt page using it. Generation is deferred to the client;
  server-rendered QR codes come from calling the synchronous Node API in a
  server route instead.
- **Fuzzing.** `cargo-fuzz` targets for both decode entry points, a seed corpus
  generated from real encoder output, and a weekly CI workflow. The corpus has
  to start from real images: random bytes never get past
  `image::guess_format`, so an unseeded run explores nothing. `npm run fuzz`
  runs it locally.
- **A compatibility policy** in the README: what counts as public API, what each
  version bump means, the MSRV rule, and the deliberate omissions — colour,
  `decode`'s return shape, PNG logos — written down as decisions rather than
  left as gaps.
- **Browser tests run headless in CI.** The 14 assertions in
  `tests/browser.html` cover what no Node test can reach — WASM over HTTP,
  canvas round trips, object-URL lifetimes, a real `MediaStream`, Vue in a
  mounted app — and until now ran only when someone opened the page.
- **CI covers Windows and the declared MSRV** — which caught a lie on its first
  run. `rust-version` claimed 1.85, but `image` requires 1.88, so the decode
  feature could never have built there. Corrected to **1.88** and now enforced
  against every feature set on every push.
- `ROADMAP.md` — what has to be true before 1.0, and why.
- `examples/decode_limits.rs` — the reproduction for the memory issue, kept as a
  runnable description of the threat model.

## [0.6.0] - 2026-08-23

Everything from 0.5 still works — see [MIGRATION.md](./MIGRATION.md). The one
behavioural change to check is that `size` now means the actual pixel size of
the image you get back.

### Fixed

- **`size` is now the real output size.** 0.5 computed the scale from the symbol
  alone and then added the quiet zone outside it, so `{ size: 320 }` returned a
  396x396 PNG for `https://example.com` — and only 298x298 for a 1000-character
  payload. `size` is now the edge length of the finished image, quiet zone
  included, with modules still on whole pixels. `sizeMode: 'fit'` opts into the
  largest whole-module image that fits inside `size` instead.
- **The silent 128 px floor is gone.** `{ size: 64 }` now renders 64 px instead
  of being quietly raised.
- **Node no longer loads the browser build.** The `exports` map listed `import`
  before `node`, so Node ESM could resolve to the `fetch`-based web entry and
  fail. `node` now comes first, and the Node build declares `"type": "commonjs"`
  next to its WASM glue so a `"type": "module"` root cannot break it.
- **`ecc` and `sizeMode` are validated.** An unrecognized level used to fall
  through to `Q` in silence; it now throws `INVALID_OPTION`. Lower-case values
  are accepted and normalized.

### Changed

- **The decoder is a separate WASM module**, loaded only when `decode` is first
  called. Pages that only generate QR codes download **85 KB gzipped instead of
  580 KB**.
- **The `image` crate is now built with only png/jpeg/webp.** The default
  feature set compiled TIFF, DDS, OpenEXR, HDR, PNM, ICO, BMP and GIF decoders
  into the binary; none of them can appear in a QR scan. The decoder module went
  from 1.4 MB to 597 KB.
- The direct `png` dependency moved to 0.18, matching what `image` pulls in, so
  the binary no longer contains two copies of the PNG codec.
- **Errors are real `Error` objects with a stable `code`** (`PAYLOAD_TOO_LONG`,
  `QR_NOT_FOUND`, ...). 0.5 threw a bare string, so `err.message` was undefined.
- Node and browser entries now have **separate type declarations** — Node
  signatures are synchronous instead of `Promise<T> | T`.
- Option handling lives in one shared module used by both entries, rather than
  being duplicated per entry.
- SVG and PNG output for a given `size` differ from 0.5 because the raster
  geometry changed. The encoded payload is identical.

### Added

- **Centre logo support.** `logoSpace` (a percentage of the symbol width) blanks
  a centred square; `generateSvg` also takes a `logo` href and draws it for you.
  The request is rejected with `LOGO_SPACE_TOO_LARGE` if it would spend more of
  the error-correction budget than the level can spare, or if the square would
  reach the finder patterns.
- **Camera scanning** — `barqr/scanner` (`createScanner`,
  `listCameras`) and the `useQrScanner` React hook. Frames come from
  `requestVideoFrameCallback` where available, downscaled to 640 px, throttled,
  and de-duplicated. Plain JS, so it adds nothing to the WASM binaries.
- **Payload builders** — `barqr/payload`: `wifi`, `mecard`,
  `vcard`, `mailto`, `sms`, `tel`, `geo`, `otpauth`, and `promptpay` (Thai
  EMVCo merchant-presented QR, with a CRC-16/CCITT-FALSE checksum). Each escapes
  its own separators — the failure mode otherwise is a code that scans fine and
  then does nothing.
- `generateMany(texts, opts)` — encode a batch in one crossing of the JS/WASM
  boundary. Errors carry the failing `index`.
- `decodeAll(input)` — every code in the image, each with its pixel corners
  (`[top-left, top-right, bottom-right, bottom-left]`), version and ECC level.
- `sizeMode: 'exact' | 'fit'`.
- `generateModules(text, opts)` — the raw module grid
  (`{ n, margin, scale, size, origin, version, dark }`) for rendering to canvas,
  inline `<svg>`, PDF or native.
- `useGenerateModules()` React hook.
- `ready({ decoder })` to preload WASM before the first render.
- camelCase names (`generatePng`, `generateSvg`, `generateModules`); the 0.5
  snake_case names remain as aliases.
- `barqr/node` subpath export.
- Rust convenience helpers `barqr::png()` / `svg()`, and `GenerateOptions`
  replacing the positional `(text, size, margin, ecc)` signature. Rust also gains
  `decode_all`, `Corner`, and `render_svg_modules_with_logo`.

### Testing & CI

- **33 Rust tests** — sizing maths, 1-bit scanline clearing against a naive
  reference, PNG/SVG structure, and generate→decode round trips across every ECC
  level, size, margin and a Thai/Japanese/emoji payload set. Previously there
  were none.
- **40 package-level tests** (`node --test`) covering the shipped entry points,
  `exports` resolution, the ESM/CJS boundary, error codes, and every payload
  builder (including the PromptPay TLV structure and its checksum against the
  standard CRC test vector).
- **13 browser tests** (`tests/browser.html`) — canvas round trip, lazy decoder
  loading, logo rendering through `DOMParser`, and the scanner driven by a real
  `MediaStream` from `canvas.captureStream()`, so the camera path is exercised
  without a camera.
- GitHub Actions: fmt, clippy (native *and* wasm targets), the Cargo feature
  matrix, all four WASM builds, package tests, `npm pack` verification, and a
  **bundle size budget that fails the build** if a binary bloats again.
- Tag-triggered publish workflow with npm provenance.
- `tests/my-app` is now a real Next.js fixture that installs the packed tarball
  and imports through the package name, so it exercises the `exports` map the
  way a user does. It covers client hooks, a Server Component, a Route Handler
  and the scanner (with a simulated camera, so it runs on hardware without one).

### Fixed (bundlers)

- **The package now works in Next.js with no configuration.** wasm-pack's Node
  glue locates its binary with `readFileSync(__dirname + "/...")`; any bundler
  that pulls that CommonJS module into its own output rewrites `__dirname`, so
  0.5 failed with `ENOENT` at import time inside a server component, a route
  handler, or a serverless bundle. The Node binaries are now inlined as base64
  at build time, so there is no path left to break.

  The usual workaround — adding the package to `serverExternalPackages` — is
  **not** recommended and should be removed if you added it: an externalized
  copy of the React hooks resolves its own `react`, and every client component
  using them then fails during SSR with a null hook dispatcher.

  Cost: the Node entry points are ~30% larger on disk and near-identical after
  gzip. Browser bundles are unaffected — they fetch their `.wasm` as an asset.

## [0.5.0] - 2026-04-18

### Performance

End-to-end QR generation is now ~9.5× faster. On Apple Silicon (release + LTO) a typical URL at `size: 320`:

- `generate` → 1-bit PNG: **~96 µs** (was ~920 µs)
- `generate_svg` → `<path>`: **~90 µs**

### Changed

- **QR encoder swapped from `qrcode` to `fast_qr`** — ~10× faster module generation for typical payloads.
- **PNG output is now 1-bit grayscale** instead of 8-bit. Smaller files (~5.5 KB vs ~37 KB for a 320px URL QR) and faster encoding. The bytes are different from 0.4.x — callers who hash/cache PNG output will see mismatches.
- **SVG output is now a single `<path>` with relative commands**, replacing the per-pixel `<rect>` emission. Much smaller markup (~5 KB vs ~160 KB for a 320px URL QR). Consumers that parse the SVG structure will need to adapt.
- `render_svg_modules` / `render_png_modules` / `generate_qr_modules` / `rasterize` are now exposed from the Rust crate for users rendering at the module level.

### Fixed

- `generate(text)` no longer throws when called without an `options` argument — defaults (`size: 320`, `margin: 4`, `ecc: 'Q'`) are now applied in the JS shim.
- `ecc` option (`'L' | 'M' | 'Q' | 'H'`) is now correctly translated to the underlying `u8` before crossing the WASM boundary. Previously, all values silently fell back to `Q`.
- `useGenerate` / `useGenerateSvg` no longer re-run WASM on every React render when callers inline their `opts` object — effect deps are now the primitive option fields.
- `useGenerate` now passes the `Uint8Array` directly to `new Blob([…])`, removing an unnecessary `ArrayBuffer` slice copy.

### Added

- `benches/generate.rs` — criterion benchmarks covering module generation, PNG/SVG rendering, and end-to-end pipelines. Run with `npm run bench` or `cargo bench --bench generate`.
- Decode path (`core::decode`) computes luminance inline via the `rqrr` closure (integer BT.601, no intermediate grayscale buffer).

### Publishing

- `prepare` script renamed to `prepack` so `npm install` in a fresh clone no longer tries to build the WASM binary.
- `postpublish` auto-pushes git tags.

## [0.4.4] - 2026-02-05

### Fixed

- Fixed quiet zone (`margin`) not being applied due to incorrect parameter mapping between the JavaScript wrapper and the WASM function, causing the margin value to always fall back to the default.

## [0.4.2] - 2026-01-29

### Fixed

- Fixed ESM export paths by adding explicit `.js` extensions.
  This resolves `ERR_MODULE_NOT_FOUND` in Next.js Pages Router and Node ESM.
