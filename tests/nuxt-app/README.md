# barqr — Nuxt fixture

The Vue counterpart to [`../my-app`](../my-app). Unit tests cannot see what a
framework's bundler does to a package, and this project has been bitten by that
twice already — both times in Next.js, both times invisible to everything else.

Nitro bundles server code the same way, so this exists to prove the same
failures do not happen here.

`nuxt.config.ts` is deliberately empty. **If it ever needs an entry for
`barqr`, that is a bug in the package, not a fix here.**

```bash
# from the repo root
npm run build && npm pack --ignore-scripts
cd tests/nuxt-app
npm install && npm install ../../barqr-0.6.0.tgz
npm run dev
```

| Route      | Covers                                                                |
| ---------- | --------------------------------------------------------------------- |
| `/`        | All four generate/decode composables, plus the core API, in the client |
| `/ssr`     | `useAsyncData` on the server — QR markup arrives in the HTML           |
| `/api/qr`  | A Nitro route handler returning PNG bytes from the sync Node build     |
| `/scan`    | `useQrScanner`, with a canvas standing in for a camera                 |

`/scan` needs a visible tab: both the fake camera and the scanner's frame pump
stop in a background tab, which is a browser behaviour rather than a bug. The
headless coverage for that path lives in `tests/browser.html`, which CI runs.

Re-run both install lines after every `npm pack` — npm copies the tarball, it
does not link it.

And clear Vite's pre-bundling cache when the package's *exports* change, or the
dev server keeps serving the previous shape and reports a missing export that is
plainly there on disk:

```bash
rm -rf .nuxt node_modules/.vite
```
