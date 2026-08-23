# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`@wirunrom/hqr-generate` is a QR code generator and decoder with a Rust core compiled to WebAssembly, plus thin JS/React wrappers. Core philosophy: **binary-first** — core APIs return raw `Uint8Array` (PNG) or `string` (SVG); Base64/Data URL conversion is pushed to the UI layer.

## Build & Dev Commands

Building requires `wasm-pack` (and a Rust toolchain with `wasm32-unknown-unknown`).

- `npm run build` — 4 WASM builds + React TS
- `npm run build:wasm` — the four `wasm-pack` builds, then `scripts/finalize-pkg.mjs`
- `npm run build:react` — `tsc -p tsconfig.react.json` (compiles `react-src/` → `react/`)
- `npm test` — `cargo test --features decode` + `node --test tests/node/*.test.mjs`
- `npm run lint` — `cargo fmt --check` + `cargo clippy -D warnings`
- `npm run size` — bundle size report; **exits non-zero if a binary exceeds its budget**
- `npm run bench` — criterion benchmarks (`benches/generate.rs`)
- `npm run clean` — removes `pkg/` and `react/`

Rust-only workflow (no wasm toolchain needed):
- `cargo test --features decode` — unit + round-trip tests
- `cargo check --no-default-features --features generate` / `--features decode` — each published binary's feature set must compile on its own

`tests/browser.html` is the browser smoke test for the local build (serve over HTTP; WASM won't load from `file://`). It covers the scanner by stubbing `getUserMedia` with `canvas.captureStream()` — a real `MediaStream`, so the whole pump/decode/dedupe path runs without a camera. `tests/test.html` points at the published CDN build. `tests/my-app/` is a manual Next.js app.

Publishing: tag-triggered via `.github/workflows/publish.yml`, authenticated by **OIDC trusted publishing** — there is no `NPM_TOKEN` secret, and there should never be one. npmjs.com is configured to trust this repo plus the workflow filename, so **renaming `publish.yml` breaks publishing** until the trusted publisher is updated to match. Provenance comes with it. Pushing a `v*` tag builds, tests, checks the size budget, verifies the tag matches `package.json`, publishes to npm, and then creates the GitHub release.

CI and publish both run Node 24: npm 11.5.1+ is what trusted publishing needs, and the publish job re-checks that at runtime rather than trusting the runner image.

### Renaming the package

`node scripts/rename.mjs --npm <name> [--crate <name>] [--repo <owner/repo>] [--dry-run]`

The name lives in 23 files for npm alone, 39 once the crate and repo are included — README prose, `.d.ts` files, both framework fixtures, the wasm glue filenames, the size budget. Done by hand you ship a package whose own docs import something that does not exist.

Two things are left alone deliberately. `.github/release-notes/v0.*.md` describe releases that already happened under the old name; rewriting them would put the repo out of step with what is published. And `MIGRATION.md` plus `release-notes/v1.0.0.md` are *about* the rename, so they carry a `__NEW_PKG__` placeholder that gets filled, rather than a name that gets replaced — which is also why the README never spells the old name out.

The script prints what it cannot do: updating npm's Trusted Publisher (bound to `owner/repo/publish.yml`, so **renaming the repo breaks publishing until it matches**), `npm deprecate` on the old package (**never** unpublish — that breaks lockfiles), and the GitHub repo rename itself.

**Before tagging a release, write `.github/release-notes/vX.Y.Z.md`.** Its `# ` heading becomes the release title and the rest becomes the body; without it the workflow falls back to auto-generated notes and says so in a warning. Links in that file must be absolute and pinned to the tag — GitHub does not resolve relative links in release bodies. Manual escape hatches: `publish:npm`, `publish:github`, `release:test`.

## Architecture

### Four WASM binaries, not one

The encoder and decoder are built separately and shipped as separate `.wasm` files:

| out-dir             | features         | target   | ~gzip  |
| ------------------- | ---------------- | -------- | ------ |
| `pkg/web`           | `wasm,generate`  | web      | 85 KB  |
| `pkg/web-decode`    | `wasm,decode`    | web      | 280 KB |
| `pkg/nodejs`        | `wasm,generate`  | nodejs   | 85 KB  |
| `pkg/nodejs-decode` | `wasm,decode`    | nodejs   | 280 KB |

The decoder is loaded lazily (`await import(...)` on web, `createRequire` on Node) the first time `decode` is called, so generate-only consumers never pay for it. **Do not merge the two back into one binary**, and do not add a dependency to the `generate` feature without checking `npm run size` — that budget is what keeps this honest (0.5.0 shipped 1.4 MB by accident).

`image` is deliberately `default-features = false, features = ["png","jpeg","webp"]`. The default set compiles TIFF/DDS/OpenEXR/HDR/PNM/ICO/BMP/GIF decoders that a QR scan can never contain. Keep the direct `png` dependency in lockstep with the version `image` pulls in, or the binary ends up with two copies of the PNG codec.

### Rust core (`src/`)

The pipeline is split into two layers to keep fast paths cheap:

1. **Module grid** (cheap, ~`n²` bools where `n` ≈ 21–177):
   - `core::generate::generate_qr_modules(text, GenerateOptions)` → `QrModules { n, margin, scale, offset, img_size, dark }`
   - QR encoding uses the `fast_qr` crate. `QRBuilder::new(bytes).ecl(ecl).build()` returns a `QRCode` indexed as `qr[y][x] -> &[Module]`; `Module::value()` is the dark/light bool.
2. **Rasterization** (only when bytes are actually needed):
   - `render::png::render_png_modules(&QrModules)` — rasterizes **directly into a 1-bit packed PNG scanline buffer** (`BitDepth::One`), using `clear_range_1bit` with head/middle/tail masking. No intermediate 8-bit bitmap on the fast path.
   - `render::svg::render_svg_modules(&QrModules)` — one `<path>` with a rectangular subpath per horizontal run of dark modules, relative `m` commands, pen position tracked to keep `d` compact.
   - `rasterize(&QrModules)` → `QrBitmap` and `render_png` / `render_svg` are the legacy 8-bit paths, kept for API compatibility and bench comparison. Not used by the wasm entry points.

`logo_space` blanks a centred square of modules so a logo can sit there. Two limits are enforced in `logo_side()` and both matter: error correction has to reconstruct every blanked module (we spend at most **half** the level's budget, leaving the rest for real-world damage), and the square must never reach the finder patterns or separators — 8 modules in from each corner — because no amount of ECC brings those back. The SVG renderer draws the logo; PNG only reserves the space, because decoding images in the encoder build is precisely what would undo the size work.

**Sizing (`layout()` in `generate.rs`) is the part most likely to be broken by a careless edit.** `scale` is always a whole number of pixels per module — never scale fractionally, that is what keeps codes crisp and scannable. `SizeMode::Exact` hits the requested pixel size by widening the quiet zone with the leftover pixels (`offset`); `SizeMode::Fit` returns the largest whole-module image that fits. Renderers must offset every coordinate by `QrModules::origin_px()`. `tests/roundtrip.rs::extra_padding_does_not_shift_the_symbol_out_of_alignment` sweeps sizes 300..320 to catch off-by-one drift here.

Other files:
- `src/core/types.rs` — `Ecc`, `SizeMode`, `GenerateOptions`, `QrBitmap`, `QrModules`, `DecodeInput`.
- `src/core/decode/` — behind `decode`. `impl_.rs` computes BT.601 luminance inline inside the `rqrr::PreparedImage::prepare_from_greyscale` closure (integer shifts, no intermediate grayscale `Vec`), and distinguishes "no symbol" (`NotFound`) from "symbol found, unreadable" (`Corrupt`).
- `src/error.rs` — `GenerateError` / `DecodeError`, each with a stable `.code()` string that becomes `err.code` in JS. Never leak `{:?}` of a Rust enum to JS.
- `src/wasm.rs` — `#[wasm_bindgen]` entry points, each gated on its feature. Errors cross as `js_sys::Error` with `code` set via `Reflect`. `generate_modules` returns a **plain JS object**, not a wasm-bindgen class, so callers have nothing to `.free()`.
- `generate_many_png` amortizes the FFI boundary for batches; `decode_all` returns every symbol with its corner points.
- `ecc`, `size_mode` and `logo_space` cross the FFI boundary as `u8` (`0=L,1=M,2=Q,3=H`; `0=exact,1=fit`). The JS layer maps the strings — **never pass the string straight to WASM** (that was a real bug that silently forced every code to ECC Q).

### Cargo features
- `generate` (default) — `fast_qr` + `png`, encoder and renderers.
- `decode` — `image` + `rqrr`.
- `wasm` — `wasm-bindgen` + `js-sys`, exposes `src/wasm.rs` for whichever of the two above is enabled.

All three combinations must compile independently; CI checks the matrix.

**The Node binaries are inlined as base64 by `scripts/finalize-pkg.mjs`, and must stay that way.** wasm-pack's Node glue locates its binary with `readFileSync(__dirname + "/hqr_generate_bg.wasm")`, and any bundler that pulls that CJS module into its own output rewrites `__dirname`, so the read fails with `ENOENT` at import time — Next.js server components, route handlers, serverless bundles.

The usual workaround for WASM packages, `serverExternalPackages`, was tried and is **worse**: an externalized copy of `react/*.js` resolves its own `react`, so every client component using our hooks dies during SSR with `Cannot read properties of null (reading 'useRef')`. Both failures are silent in unit tests and only show up in a real framework, which is what `tests/my-app` exists to catch.

`inlineWasm()` asserts it matched wasm-pack's disk-load block exactly once and throws otherwise — if a wasm-pack upgrade changes that glue, the build fails loudly instead of shipping a package that breaks only inside bundlers.

### JS entry points

- `internal/options.js` — **the single source of truth for option handling**, shared by both entries. Defaults (`size=320, margin=4, ecc='Q', sizeMode='exact', logoSpace=0`), string→`u8` translation, validation. `generate("x")` with no opts must not throw.
- `payload.js` (`/payload` subpath) — pure string builders. **No imports from the rest of the package**, so nothing pulls WASM in. PromptPay is EMVCo TLV plus CRC-16/CCITT-FALSE; the CRC covers tag 63's own `6304` header, and `tests/node/payload.test.mjs` pins both the structure and the standard `123456789 -> 0x29B1` vector.
- `scanner.js` (`/scanner` subpath) — camera plumbing over `decodeAll`. Main-thread decode, throttled by `scanIntervalMs`, frames downscaled to `maxSide` before decoding, corners scaled back to video coordinates before they reach the caller. `QR_NOT_FOUND` on a frame is the normal case and must never reach `onError`.
- `index.web.js` — browser ESM. Lazy `init()` cached in `_encoderReady`; decoder via `import()` cached in `_decoderReady`. All functions async.
- `index.node.js` — Node ESM. `createRequire` so exports stay **synchronous**, and so the decoder is only read off disk on first use.
- `package.json` `exports`: **`browser` and `node` must both come before `default`.** 0.5 listed `import` first, which made Node ESM resolve to the fetch-based web build. `tests/node/resolution.test.mjs` asserts this ordering.
- `scripts/finalize-pkg.mjs` writes `{"type":"commonjs"}` / `{"type":"module"}` into each `pkg/*` directory. Do not just delete wasm-pack's `package.json` — the repo root is `"type": "module"`, so the CJS glue would be parsed as ESM.

### Vue layer (`vue-src/` → `vue/`)

Compiled by `tsconfig.vue.json`. `vue` is an optional peer dependency (>=3.3, for `toValue`).

- **`watchEffect` runs during SSR**, unlike React's `useEffect`. Every composable is guarded by `isBrowser` in `vue-src/shared.ts`; without it a Nuxt page would `fetch()` the WASM binary while rendering on the server. `tests/node/vue-ssr.test.mjs` renders each composable through `vue/server-renderer` to keep that honest.
- Options are read through `toValue` **inside** the effect, which is what makes the effect track each of them. Reading them outside would silently freeze the composable on its first values.
- `useQrScanner` returns a ref named `video` so `<video ref="video">` binds by convention, and reads `opts.onResult` through the options object rather than capturing it — replacing the callback must not restart the camera.
- The compiled output imports a bare `vue` specifier. Bundlers resolve it; `tests/browser.html` needs an import map.

### React layer (`react-src/` → `react/`)

Compiled separately via `tsconfig.react.json`. `react` is an optional peer dependency.

- Hooks **destructure `opts.size/margin/ecc/sizeMode` into primitive effect deps**. Passing the whole `opts` object re-runs WASM every render when callers inline it. If you add an option, add it to the destructure *and* the dep array.
- Hooks pass `Uint8Array` directly to `new Blob([result as BlobPart], ...)` — no `ArrayBuffer` slice copy. The cast is for TS's `SharedArrayBuffer` variance only.
- Object URLs are revoked in effect cleanup.
- `useDecode` depends on `input` by identity **on purpose** — a camera feed produces frames with identical dimensions, so any shallow signature would decode only the first one.
- `useQrScanner` holds `onResult` in a ref rather than a dep, so a fresh closure from the parent does not tear the camera down and re-request it on every render.

## Conventions

- Keep the core binary-first. No Base64/Data URL helpers in the Rust core or JS shims — that belongs in the React layer or caller code.
- Output is intentionally **black & white only** (scan reliability). Don't add color options without a strong reason.
- Prefer the module-level fast paths (`generate_qr_modules` + `render_*_modules`). The `QrBitmap` path is back-compat only.
- When touching the WASM API surface, changes must propagate through: `src/wasm.rs` → `internal/options.js` → `index.web.js` + `index.node.js` → `index.d.ts` + `index.node.d.ts` → `react-src/` hooks (incl. dep arrays) → `tests/node/`.
- `wasm-opt` runs with `--all-features` on purpose. Naming features by hand made it reject the module the moment wasm-bindgen emitted one more.
- Anything user-visible that changes between versions goes in `CHANGELOG.md` **and** `MIGRATION.md`.
- `pkg/`, `react/` are generated and **gitignored** — never edit them, never commit them. `prepack` builds them into the tarball.
- Releases are cut by pushing a `v*` tag; the workflow derives the npm dist-tag from the version, so `v0.7.0-next.0` lands on `next` and never on `latest`. It publishes with `--ignore-scripts` so the tarball is exactly the tree that CI built, size-checked and tested.
