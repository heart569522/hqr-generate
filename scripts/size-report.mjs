#!/usr/bin/env node
// What a consumer actually downloads. Run after `npm run build:wasm`.
//
// CI fails the build if a binary crosses its budget — the 0.5.0 line shipped a
// 1.4 MB decoder by accident because nothing was watching this number.

import { readFile, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";

// Gzipped bytes, roughly 25% headroom over the current numbers.
//
// The web entries are what a visitor downloads, so they are the numbers that
// matter. The Node entries carry their binary inline as base64 (see
// scripts/finalize-pkg.mjs) and are budgeted too, since the same dependency
// mistake would show up in both.
const BUDGET_GZIP = {
  "pkg/web/barqr_bg.wasm": 120_000,
  "pkg/web-decode/barqr_bg.wasm": 355_000,
  "pkg/nodejs/barqr.js": 165_000,
  "pkg/nodejs-decode/barqr.js": 425_000,
};

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

let failed = false;
console.log("file                                     raw        gzip       budget");
console.log("-".repeat(76));

for (const [path, budget] of Object.entries(BUDGET_GZIP)) {
  let raw;
  try {
    raw = await readFile(path);
    await stat(path);
  } catch {
    console.error(`${path.padEnd(40)} MISSING`);
    failed = true;
    continue;
  }

  const gz = gzipSync(raw, { level: 9 }).length;
  const over = gz > budget;
  if (over) failed = true;

  console.log(
    `${path.padEnd(40)} ${kb(raw.length).padEnd(10)} ${kb(gz).padEnd(10)} ${kb(budget)}${
      over ? "  OVER BUDGET" : ""
    }`,
  );
}

if (failed) {
  console.error("\nsize budget exceeded — check what got pulled into the WASM binary");
  process.exit(1);
}
