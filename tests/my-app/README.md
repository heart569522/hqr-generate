# hqr-generate — Next.js fixture

Not a demo. This app exists to catch the failures that only appear once the
package is resolved through its `exports` map by a real framework: module
resolution, ESM/CJS boundaries, and bundlers rewriting the paths WASM glue
depends on. It found the `__dirname` bug that broke every server-side render in
0.5.

It installs the **packed tarball**, not a relative path, because a relative
import skips `exports` entirely and would prove nothing.

```bash
# from the repo root
npm run build && npm pack --ignore-scripts
cd tests/my-app
npm install && npm install ../../wirunrom-hqr-generate-0.6.0.tgz
npm run dev
```

| Route         | Covers                                                       |
| ------------- | ------------------------------------------------------------ |
| `/`           | Client hooks + 8 assertions against the browser build         |
| `/ssr`        | Server Component — QR markup arrives in the HTML              |
| `/api/qr`     | Route Handler streaming PNG bytes from the sync Node build    |
| `/scan`       | Camera scanner                                                |

`/scan` has a **simulated camera** button: it feeds the scanner a
`canvas.captureStream()`, which is a real `MediaStream`, so the whole path runs
on a machine with no camera. The real camera needs https on a phone.

Re-run both install lines after every `npm pack` — npm copies the tarball, it
does not link it.
