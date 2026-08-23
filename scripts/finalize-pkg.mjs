#!/usr/bin/env node
// Post-process the wasm-pack output directories.
//
// Two jobs:
//
// 1. Drop the npm package furniture wasm-pack writes into each --out-dir
//    (README, LICENSE, package.json) and replace it with a one-line
//    package.json pinning the module format. The file cannot simply be deleted:
//    the repo root is `"type": "module"`, so without an explicit marker Node
//    would parse the CommonJS glue in pkg/nodejs* as ESM and die on
//    `require is not defined`.
//
// 2. Inline the Node binaries as base64 instead of reading them off disk. See
//    `inlineWasm` for why.

import { readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const PKG_DIR = new URL("../pkg/", import.meta.url).pathname;

const OUTPUTS = {
  web: { type: "module", inline: false },
  "web-decode": { type: "module", inline: false },
  "web-decode-any": { type: "module", inline: false },
  nodejs: { type: "commonjs", inline: true },
  "nodejs-decode": { type: "commonjs", inline: true },
  "nodejs-decode-any": { type: "commonjs", inline: true },
};

const STRIP = ["README.md", "LICENSE", ".gitignore"];

// What wasm-pack's --target nodejs glue emits to locate its binary.
const INLINE_MARKER = "// Binary inlined at build time";

const DISK_LOAD =
  "const wasmPath = `${__dirname}/barqrcode_bg.wasm`;\n" +
  "const wasmBytes = require('fs').readFileSync(wasmPath);";

/**
 * Replace the `__dirname` file read with an inline base64 payload.
 *
 * Bundlers rewrite `__dirname` when they pull a CommonJS module into their own
 * output, so the read fails with ENOENT at import time — that is what breaks
 * this package inside a Next.js server component or route handler, and inside
 * serverless bundles that never trace the .wasm file at all.
 *
 * The obvious workaround, telling users to mark the package external
 * (`serverExternalPackages`), trades one break for another: an externalized
 * copy of the React hooks resolves its own `react`, and every client component
 * that uses them then dies during SSR with a null hook dispatcher.
 *
 * So the binary travels inside the JS. It costs ~33% before gzip — which the
 * tarball mostly wins back — and buys a package that works in any bundler with
 * no configuration. The browser builds are untouched: they fetch their .wasm as
 * an asset, which bundlers already handle.
 */
async function inlineWasm(dir) {
  const jsPath = join(dir, "barqrcode.js");
  const wasmPath = join(dir, "barqrcode_bg.wasm");

  const source = await readFile(jsPath, "utf8");

  // Idempotent: rebuilding one output directory and re-running this script must
  // not fail on the directories that were already inlined.
  if (!existsSync(wasmPath) && source.includes(INLINE_MARKER)) {
    return { base64Bytes: 0, alreadyDone: true };
  }
  const occurrences = source.split(DISK_LOAD).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `${jsPath}: expected exactly one disk-load block to replace, found ${occurrences}. ` +
        "wasm-pack probably changed its Node glue — update DISK_LOAD in this script.",
    );
  }

  const base64 = (await readFile(wasmPath)).toString("base64");
  const inlined = source.replace(
    DISK_LOAD,
    `${INLINE_MARKER} so no bundler can break the file path.\n` +
      `const wasmBytes = Buffer.from("${base64}", "base64");`,
  );

  await writeFile(jsPath, inlined);
  await rm(wasmPath, { force: true });

  const before = (await stat(wasmPath).catch(() => null))?.size ?? base64.length;
  return { base64Bytes: base64.length, before };
}

if (!existsSync(PKG_DIR)) {
  console.error("pkg/ not found — run the wasm builds first");
  process.exit(1);
}

const dirs = await readdir(PKG_DIR, { withFileTypes: true });
let touched = 0;

for (const entry of dirs) {
  if (!entry.isDirectory()) continue;

  const config = OUTPUTS[entry.name];
  if (!config) {
    console.warn(`! pkg/${entry.name}: unknown output directory, skipped`);
    continue;
  }

  const dir = join(PKG_DIR, entry.name);
  await Promise.all(STRIP.map((f) => rm(join(dir, f), { force: true })));
  await writeFile(join(dir, "package.json"), `{ "type": "${config.type}" }\n`);

  let note = "";
  if (config.inline) {
    const { base64Bytes, alreadyDone } = await inlineWasm(dir);
    note = alreadyDone
      ? ", wasm already inlined"
      : `, wasm inlined (${(base64Bytes / 1024).toFixed(0)} KB base64)`;
  }

  console.log(`  pkg/${entry.name}: type=${config.type}${note}`);
  touched++;
}

const expected = Object.keys(OUTPUTS).length;
if (touched !== expected) {
  console.error(`expected ${expected} wasm output directories, finalized ${touched}`);
  process.exit(1);
}
