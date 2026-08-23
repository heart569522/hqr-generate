# Road to 1.0

**1.0 is not a feature target. It is a promise that the API stops changing.**

The code for it is done. What remains cannot be done by reading the repository.

---

## Done

Everything below was decided or built for this release. The reasoning lives in
`CHANGELOG.md`; this is the checklist.

**API, settled and frozen at 1.0**

- Renamed to `barqr`, package, crate and repository — the old name described
  neither half of what this does.
- Every function names its symbol family: `qrPng`/`qrSvg`/`qrModules`/`qrMany`
  against `barcodePng`/`barcodeSvg`/`barcodeModules`. Hooks and composables line
  up one for one in React and Vue.
- `decode` returns a `string` and `decodeAll` returns objects — deliberate, and
  written down rather than merely true.
- `logo` stays SVG-only; PNG reserves the space and the caller composites.
- `margin` stays at the spec's 4.
- The 0.5 compatibility aliases and the bare `generate` alias are gone.
- Error enums are `#[non_exhaustive]`, so new variants are not breaking.
- The compatibility policy is in the README.

**Capability**

- Nine 1D symbologies, encoded and decoded.
- A third WASM module for any-symbology decoding, loaded only on demand.
- The camera scanner reads barcodes with `formats: "any"`.
- Vue and Nuxt, verified against a real Nuxt app with no bundler configuration.

**Confidence**

- Two vulnerabilities found and fixed: unbounded allocation from a small file,
  and a reachable panic that `panic = "abort"` made fatal on wasm.
- Fuzzing, weekly, over both decode entry points.
- Browser tests headless in CI; Windows and the declared MSRV covered.
- Two framework fixtures that install the packed tarball, which have caught
  three bugs no unit test could see.

---

## Before tagging

The three that needed a person are done. Two mechanical steps remain.

- [x] **PromptPay against a real banking app.** Confirmed by the maintainer.
- [x] **The scanner on real phone cameras**, iOS and Android. Confirmed by the
      maintainer. The automated coverage drives a canvas-backed `MediaStream`,
      which exercises every line of the frame pump but not a sensor, an
      autofocus or a dim room — so this one could only ever be checked by hand.
- [x] **The maintainer's payment integration running on this API.**

And two mechanical steps, in this order:

- [ ] **Claim `barqr` on npm and point its Trusted Publisher at
      `wirunrom/barqr` + `publish.yml`.** The publisher is currently bound to
      the old repository name, so publishing fails until it is repointed — and
      it cannot be configured until the package exists.
- [ ] **`npm version 1.0.0`, then tag.** Release notes are already written at
      `.github/release-notes/v1.0.0.md`; they carry a `barqr` placeholder
      that `scripts/rename.mjs` fills.

---

## Deliberately after 1.0

All additive, none blocking, none worth delaying the freeze for.

- **Publish the crate to crates.io.** The Rust API is ready and the name is
  settled; this is just a `cargo publish` nobody has run yet.
- **Decode off the main thread.** The scanner decodes inline, throttled. A
  worker would keep a 1080p frame from janking the page, and can be added as an
  option without touching the frozen surface.
- **More symbologies to *encode*** — DataMatrix and PDF417 are already readable,
  but not writable.

Colour and module shapes stay out. They trade scan reliability for looks, and
this library takes the other side of that trade.

**Features do not make a 1.0. Stability does.**
