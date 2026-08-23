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

### Decisions, now made

| | Question | Answer |
| --- | --- | --- |
| 1 | Drop the deprecated `generate_png` / `generate_svg` / `generate_modules` aliases? | **Dropped.** They existed for 0.5 compatibility; carrying something marked `@deprecated` into a 1.0 means removing it in 2.0 or never. |
| 2 | Should `decode` return `DecodedQr` instead of `string`? | **No.** `decode` is the "read the text" case and `decodeAll` is the complete one. Making the common path worse for symmetry is the wrong trade. Written down in the compatibility policy so it reads as a decision. |
| 3 | Keep `logo` as SVG-only? | **Yes.** PNG reserves the space and the caller composites. Decoding images inside the encoder build is precisely what would take it from 85 KB back to hundreds. |
| 4 | Does `margin` stay at the spec's 4? | **Yes.** Real integrations lower it to 2 because the surrounding UI is white, which is fine and now documented — but the default should be the one that is correct without knowing the page. |

Also removed: `render_svg(&QrBitmap)`, which emitted one `<rect>` per module —
143 KB against the 5.2 KB the path renderer produces for the same code. The
8-bit raster API it belonged to stays; it is a real way to get pixels, and the
docs no longer call it "legacy".

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
- ~~**Fuzz the decoder.**~~ **Done, and it paid for itself.** Two `cargo-fuzz`
  targets, seeded from real encoder output, plus a weekly CI run. The RGBA
  target found a reachable panic inside `rqrr` 0.7.1 within five minutes: an
  assertion on a value computed from image data. Fixed by upgrading `rqrr` to
  0.10; the input is now a regression test.

  Worth recording *why* this class of bug is severe here:
  `wasm32-unknown-unknown` has `panic-strategy: abort`, so a panic in the decode
  path kills the WASM instance and **cannot be caught** — no `catch_unwind`, no
  defence in depth. Keeping the dependency current and continuing to fuzz is the
  whole mitigation.
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
- **Publish the crate to crates.io** — *blocked on the package name.* The Rust
  API is ready, but publishing under a name that is about to change would burn
  it. This waits for the rename.

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

- [x] Every question in the decisions table is answered and shipped
- [x] The decoder refuses oversized images before allocating for them
- [x] Fuzzing has run without a crash for a meaningful duration
- [x] Browser tests run in CI on every push
- [x] MSRV and Windows covered in CI
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
