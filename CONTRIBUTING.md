# Contributing

The README is for people installing the package. This is for people changing it.

## Setup

A Rust toolchain with the `wasm32-unknown-unknown` target, plus
[`wasm-pack`](https://rustwasm.github.io/wasm-pack/):

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
npm install
```

## The loop

```bash
npm run build        # six WASM builds, binary inlining, React + Vue types
npm test             # Rust suites, then the packaged Node API
npm run test:browser # the same API in headless Chromium, via Playwright
npm run lint:all     # rustfmt, clippy, and clippy again per WASM feature set
npm run size         # gzipped budget per binary; CI fails on a bloat
```

`npm run lint:all` rather than `npm run lint`: the plain one checks the native
feature set only. Each WASM build compiles a different subset, and a warning
that only appears under `--features wasm,decode-any` will not show up until CI
runs it. The same applies to `cargo check` — it permits dead code, so it agrees
with you right up until clippy does not.

## Fixtures

Unit tests import the source. These import the package the way a user does,
which is a different code path and the one that has actually broken:

- [`tests/my-app`](./tests/my-app) — Next.js. Client hooks, SSR, a route
  handler, and the scanner against a simulated camera.
- [`tests/nuxt-app`](./tests/nuxt-app) — Nuxt. The same ground for Vue,
  including SSR, where `watchEffect` runs on the server and `useEffect` does
  not.

Both install the **packed tarball**, not a relative path — a relative import
skips the `exports` map, which is where the resolution bugs live.

```bash
npm run build && npm pack --ignore-scripts
cd tests/my-app && npm install && npm install ../../barqrcode-1.0.0.tgz
npm run dev
```

Vite and Turbopack cache aggressively across a reinstall. If a fixture serves
an export you just changed, or insists one you just added does not exist,
`rm -rf .next .nuxt node_modules/.vite` before believing it.

Between them these have caught three bugs no unit test could see: Turbopack
rewriting `__dirname` out of the WASM glue, an externalised React resolving a
second copy of React during SSR, and an `exports` map that let Node fall
through to the browser build.

## Renaming

`scripts/rename.mjs` renames the npm package, the crate and the repository —
three names that overlap as strings, which is why it does not do a substring
replace. `--dry-run` first.

## Notes

Architecture and the reasoning behind the current design live in
[CLAUDE.md](./CLAUDE.md). What is deliberately out of scope is in
[ROADMAP.md](./ROADMAP.md).
