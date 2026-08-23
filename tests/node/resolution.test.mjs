// Module resolution is the part users hit before any QR code is generated.
// 0.4.2 shipped a fix for `ERR_MODULE_NOT_FOUND` in Next.js; these tests keep
// that class of breakage from coming back silently.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readFile, stat } from "node:fs/promises";

const require = createRequire(import.meta.url);
const pkg = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));

test("node condition resolves before import, so Node never loads the browser build", () => {
  const root = pkg.exports["."];
  const conditions = Object.keys(root);
  assert.ok(
    conditions.indexOf("node") < conditions.indexOf("default"),
    "the `node` condition must come before `default`, or Node picks the fetch-based web build",
  );
  assert.equal(root.node.default, "./index.node.js");
  assert.equal(root.browser.default, "./index.web.js");
});

test("node gets synchronous types, browsers get async ones", () => {
  assert.equal(pkg.exports["."].node.types, "./index.node.d.ts");
  assert.equal(pkg.exports["."].browser.types, "./index.d.ts");
});

test("the CommonJS wasm glue is marked as CommonJS", () => {
  // The repo root is `"type": "module"`. Without these markers Node parses the
  // pkg/nodejs glue as ESM and dies on `require is not defined`.
  for (const dir of ["nodejs", "nodejs-decode"]) {
    assert.equal(require(`../../pkg/${dir}/package.json`).type, "commonjs", dir);
  }
  for (const dir of ["web", "web-decode"]) {
    assert.equal(require(`../../pkg/${dir}/package.json`).type, "module", dir);
  }
});

test("every subpath export points at a file that exists", async () => {
  for (const [subpath, target] of Object.entries(pkg.exports)) {
    const paths =
      typeof target === "string"
        ? [target]
        : Object.values(target).flatMap((v) => (typeof v === "string" ? [v] : Object.values(v)));

    for (const rel of paths) {
      await stat(new URL(`../../${rel}`, import.meta.url)).catch(() => {
        throw new Error(`exports["${subpath}"] points at ${rel}, which does not exist`);
      });
    }
  }
});

test("the side-effect-free subpaths load without touching WASM", async () => {
  // payload/ is pure string building and scanner/ is browser plumbing; neither
  // should drag the encoder or decoder in on import.
  const payload = await import("../../payload.js");
  assert.equal(typeof payload.promptpay, "function");

  const scanner = await import("../../scanner.js");
  assert.equal(typeof scanner.createScanner, "function");
});

test("the Node glue never touches the filesystem", async () => {
  // Regression guard. wasm-pack emits `readFileSync(__dirname + "/....wasm")`,
  // and every bundler that inlines that CommonJS module rewrites `__dirname`,
  // so the read fails with ENOENT at import time — Next.js server components,
  // route handlers, serverless bundles. scripts/finalize-pkg.mjs replaces it
  // with an inline base64 payload; if that ever silently stops happening, this
  // catches it here instead of in someone's deploy.
  for (const dir of ["nodejs", "nodejs-decode"]) {
    const glue = await readFile(
      new URL(`../../pkg/${dir}/barqrcode.js`, import.meta.url),
      "utf8",
    );
    assert.ok(!glue.includes("__dirname"), `pkg/${dir} still resolves a path at runtime`);
    assert.ok(!glue.includes("readFileSync"), `pkg/${dir} still reads its binary off disk`);
    assert.match(glue, /Buffer\.from\("[A-Za-z0-9+/]{100}/, `pkg/${dir} has no inline binary`);

    await stat(new URL(`../../pkg/${dir}/barqrcode_bg.wasm`, import.meta.url)).then(
      () => {
        throw new Error(`pkg/${dir} still ships a redundant .wasm alongside the inlined one`);
      },
      () => {},
    );
  }
});

test("the browser builds still load their .wasm as an asset", async () => {
  // The inlining is Node-only on purpose: bundlers handle a fetched .wasm fine,
  // and base64 in the browser would mean shipping 33% more over the network.
  for (const dir of ["web", "web-decode"]) {
    const wasm = await stat(new URL(`../../pkg/${dir}/barqrcode_bg.wasm`, import.meta.url));
    assert.ok(wasm.size > 100_000, `pkg/${dir} is missing its binary`);

    const glue = await readFile(
      new URL(`../../pkg/${dir}/barqrcode.js`, import.meta.url),
      "utf8",
    );
    assert.ok(!glue.includes("Buffer.from("), `pkg/${dir} should not inline its binary`);
  }
});

test("require() of the package entry works", () => {
  const mod = require("../../index.node.js");
  assert.equal(typeof mod.qrPng, "function");
  assert.ok(mod.qrPng("required from cjs").length > 0);
});

test("every file the package promises to ship exists", async () => {
  const concrete = pkg.files.filter((f) => !f.includes("*"));
  for (const f of concrete) {
    await stat(new URL(`../../${f}`, import.meta.url)).catch(() => {
      throw new Error(`package.json "files" lists ${f}, but it does not exist`);
    });
  }
});
