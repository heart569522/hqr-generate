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
