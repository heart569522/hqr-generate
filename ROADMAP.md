# Road to 1.0

**1.0 is not a feature target. It is a promise that the API stops changing.**

That makes the question "what still needs to change?", not "what else can we add".
Everything below either closes a decision that would be breaking later, or buys
the confidence to make that promise honestly.

Today the package exposes **28 public functions** (11 main, 10 `/payload`,
2 `/scanner`, 5 React hooks) plus the option and result types. All of it gets
frozen at 1.0.

---

## 0.6.x — let it be used

0.6.0 shipped a behavioural change to `size` and made `ecc` work for the first
time. Nobody has run that in anger yet, and API problems surface from use, not
from review. Not a phase with tasks: a phase with patience.

**Input worth collecting:**

- Does `sizeMode: 'exact'` match what people expected `size` to mean?
- Are the error `code`s the ones callers actually want to branch on?
- Does the scanner hold up on mid-range Android and older Safari?
- Does PromptPay pass a real banking app? *(still unverified — the structure and
  CRC are tested, a live payment is not)*

Patch releases only. No API changes.

---

## 0.7.0 — the last breaking release

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
- **Fuzz the decoder.** `cargo-fuzz` over `decode_all_from_bytes` and
  `decode_all_from_rgba`. This is the highest-value item in the whole plan: the
  decoder eats untrusted bytes from cameras and uploads, `panic = "abort"` is set
  in the release profile, and a panic takes the whole WASM instance with it.
  Anyone decoding user uploads server-side has a denial-of-service surface today
  that nobody has looked for.
- **Run the browser tests in CI.** `tests/browser.html` already holds 13 real
  assertions — including the scanner driven by a canvas-backed `MediaStream` —
  and they only run when a human opens the page. Playwright headless, one job.
- **Check the MSRV.** `rust-version = "1.85"` is declared and verified by
  nothing. One CI job pinned to that toolchain.
- **Add Windows to the matrix.** Currently ubuntu + macos.
- **Decode off the main thread.** The scanner decodes inline, throttled. A worker
  entry would keep a 1080p frame from janking the page. Additive, but it may
  change what `createScanner` accepts — better in 0.7 than after the freeze.
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
- [ ] Fuzzing has run without a crash for a meaningful duration
- [ ] Browser tests run in CI on every push
- [ ] MSRV and Windows covered in CI
- [ ] PromptPay confirmed against a real banking app
- [ ] The scanner confirmed on a real phone camera, iOS and Android
- [ ] At least one real integration has run on 0.7.x without an API complaint

---

## Explicitly not 1.0 material

Colour, module shapes (dots, rounded eyes), more payload builders, a demo site,
benchmark comparisons against other libraries. All of these are additive and can
ship in 1.1 or 1.5 without breaking anyone.

**Features do not make a 1.0. Stability does.** A 1.0 with a smaller API and a
kept promise is worth more than a 1.0 with more surface and a caveat.

---

## Suggested order

Fuzzing first. It is the one item that can *change the plan* — a crash found in
the decoder might force an API change, and finding that after the freeze is far
more expensive than finding it now.
