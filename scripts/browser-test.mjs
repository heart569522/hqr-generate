#!/usr/bin/env node
// Run tests/browser.html headless.
//
// Those assertions cover the parts no Node test can reach: WASM fetched over
// HTTP, canvas round trips, object-URL lifetimes, the scanner reading a real
// MediaStream, and the Vue composables in a mounted app. They were only ever
// run by a human opening the page, which meant in practice they ran rarely.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const ROOT = new URL("..", import.meta.url).pathname;
const PORT = 8799;

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".wasm": "application/wasm",
  ".json": "application/json",
};

const server = createServer(async (req, res) => {
  try {
    // Contain the path: this serves the repo, but only ever from the repo.
    const rel = normalize(decodeURIComponent(req.url.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
    const body = await readFile(join(ROOT, rel));
    res.writeHead(200, { "content-type": TYPES[extname(rel)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));

const browser = await chromium.launch();
const page = await browser.newPage();

const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(String(e)));

let results;
try {
  await page.goto(`http://127.0.0.1:${PORT}/tests/browser.html`, { waitUntil: "load" });
  results = await page.waitForFunction(() => window.__RESULTS__, null, { timeout: 90_000 })
    .then((handle) => handle.jsonValue());
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.error ? `\n        ${r.error}` : ""}`);
}
console.log(`\n  ${results.length - failed.length}/${results.length} passed`);

if (consoleErrors.length) {
  console.log("\n  uncaught page errors:");
  for (const e of consoleErrors) console.log(`    ${e}`);
}

process.exit(failed.length || consoleErrors.length ? 1 : 0);
