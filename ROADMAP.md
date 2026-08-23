# Road to 1.0

**1.0 is not a feature target. It is a promise that the API stops changing.**

That makes the question "what still needs to change?", not "what else can we add".
Everything below either closes a decision that would be breaking later, or buys
the confidence to make that promise honestly.

Today the package exposes **28 public functions** (11 main, 10 `/payload`,
2 `/scanner`, 5 React hooks) plus the option and result types. All of it gets
frozen at 1.0.

---

## Scope note

There is no meaningful installed base yet, and the one real integration is the
maintainer's own. That removes the usual reason to stage breaking changes
carefully across releases: **make the API right now, in one pass, and freeze it.**

Two things still need real-world confirmation and cannot be replaced by tests:

- **PromptPay against a real banking app** — the payload structure and its
  CRC-16/CCITT-FALSE checksum are covered, an actual payment is not
- **The scanner on real phone cameras**, iOS and Android

---

## 0.7.0 — one breaking pass

### Decisions to make (these need a call, not code)

| | Question | Why it must be decided before 1.0 |
| --- | --- | --- |
| 1 | Drop the deprecated `generate_png` / `generate_svg` / `generate_modules` aliases? | Shipping something marked `@deprecated` in a 1.0 means either removing it in 2.0 or never — decide which. |
| 2 | Should `decode` return `DecodedQr` instead of `string`? | `decode` gives a string, `decodeAll` gives objects with `version`, `eccLevel` and `corners`. The asymmetry is the last genuinely breaking API question left. |
| 3 | Keep `logo` as SVG-only? | PNG reserves the space but does not draw the image. Defensible — decoding images in the encoder build is what kept it at 85 KB — but it should be a stated decision, not an omission. |
| 4 | Does `margin` stay at the spec's 4? | Real integrations use 2 because the surrounding UI is white. Either document that, or reconsider the default. |

### Work

- **Remove the legacy 8-bit path** — `QrBitmap`, `rasterize`, `render_png`,
  `render_svg` in `src/render/` and `src/core/`. Nothing calls them; they exist
  for a `QrBitmap` API compatibility that has no known consumer.
- ~~**Cap the decoder's memory.**~~ **Done.** A manual audit ahead of fuzzing
  found the first real vulnerability: a 1.2 MB PNG declaring 16000x16000 made
  the decoder allocate **976 MB** and burn 2.2 s of CPU, an ~800x amplification.
  `image`'s own `max_alloc` did not help, because the largest allocation was the
  `to_rgba8()` call in this crate, which its accounting never sees. The header is
  now checked before any pixels are read, and the conversion is to luma instead
  of RGBA — a quarter of the memory and faster on legitimate images too.
- **Fuzz the decoder.** `cargo-fuzz` over `decode_all_from_bytes` and
  `decode_all_from_rgba`, on a nightly toolchain. The memory issue above was
  found by reading the code; coverage-guided fuzzing is for the panics that
  reading will not find. Note that random bytes are nearly useless here —
  `guess_format` rejects them immediately — so the corpus should be mutations of
  valid PNG/JPEG/WebP produced by the encoder.
  `panic = "abort"` in the release profile means any panic takes the whole WASM
  instance with it, so a single reachable panic is a denial of service.
- **Run the browser tests in CI.** `tests/browser.html` already holds 13 real
  assertions — including the scanner driven by a canvas-backed `MediaStream` —
  and they only run when a human opens the page. Playwright headless, one job.
- **Check the MSRV.** `rust-version = "1.85"` is declared and verified by
  nothing. One CI job pinned to that toolchain.
- **Add Windows to the matrix.** Currently ubuntu + macos.
- **Decode off the main thread.** The scanner decodes inline, throttled. A worker
  entry would keep a 1080p frame from janking the page. Additive, but it may
  change what `createScanner` accepts — better in 0.7 than after the freeze.
- ~~**Make the error enums `#[non_exhaustive]`.**~~ **Done.** Adding a variant
  after 1.0 would otherwise be a breaking change for every Rust consumer.
- **Publish the crate to crates.io.** The Rust API is already clean and
  documented; it costs one `cargo publish` and gives the encoder a second
  audience. Do it before 1.0 so its API is frozen at the same time.

---

## 1.0.0 — freeze

If 0.7 is right, this release changes almost no code.

- **Write the compatibility policy** into the README: what counts as public API
  (`internal/` does not), what semver means here, the MSRV policy, and the
  supported Node and browser ranges.
- Make the API surface match the policy: anything not meant to be public gets
  `@internal` or moves.
- Cut the release from a 0.7.x that has been in real use, with the version bump
  as the only diff.

**Exit criteria** — all of these, or it is not 1.0 yet:

- [ ] Every question in the 0.7 decisions table is answered and shipped
- [x] The decoder refuses oversized images before allocating for them
- [ ] Fuzzing has run without a crash for a meaningful duration
- [ ] Browser tests run in CI on every push
- [ ] MSRV and Windows covered in CI
- [ ] PromptPay confirmed against a real banking app
- [ ] The scanner confirmed on a real phone camera, iOS and Android
- [ ] The maintainer's payment integration has run on 0.7.x without an API complaint

---

## Explicitly not 1.0 material

Colour, module shapes (dots, rounded eyes), more payload builders, a demo site,
benchmark comparisons against other libraries. All of these are additive and can
ship in 1.1 or 1.5 without breaking anyone.

**Features do not make a 1.0. Stability does.** A 1.0 with a smaller API and a
kept promise is worth more than a 1.0 with more surface and a caveat.

---

## Suggested order

Security work first, and for the reason the memory cap just demonstrated: it is
the category that can *change the plan*. A limit had to become a new error
variant and a new error code, which is an API change — cheap now, expensive
after the freeze.
