#!/usr/bin/env node
// Rename the package everywhere at once.
//
// The name appears across README prose, type declarations, both framework
// fixtures, the wasm glue filenames and the size budget. Doing that by hand is
// how you end up with a published package whose docs import something that does
// not exist.
//
// The constants below track the *current* name, so this stays usable if the
// package is ever renamed again.
//
//   node scripts/rename.mjs --npm @scope/newname
//   node scripts/rename.mjs --npm qrkit --crate qrkit --repo owner/qrkit
//   node scripts/rename.mjs --npm qrkit --dry-run
//
// `--crate` also renames the Rust crate, which changes the emitted wasm
// filenames (barqr_bg.wasm and friends) and everything referring to
// them. Leave it off to rename only the npm package.

import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

const OLD_NPM = "barqrcode";
const OLD_CRATE_SNAKE = "barqr";
const OLD_CRATE_KEBAB = "barqr";
const OLD_REPO = "wirunrom/barqr";

// Files where the old name is the whole point, so only `__NEW_PKG__` gets
// filled in. MIGRATION.md and the v1.0.0 note used to sit here, back when
// OLD_NPM was the name they exist to migrate away from. It no longer is, so
// they rename like any other file.
const PLACEHOLDER_ONLY = new Set([]);

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".claude", "target", "pkg", "react", "vue", ".next",
  ".nuxt", ".output", "fuzz/target", "fuzz/corpus", "fuzz/artifacts",
]);
const SKIP_FILES = new Set(["package-lock.json", "Cargo.lock", "rename.mjs"]);

/// Notes for releases that already happened. They describe what was published,
/// under the name it was published as; rewriting them would put the repo out of
/// step with the releases on GitHub.
const isPublishedNote = (rel) => /^\.github\/release-notes\/v0\./.test(rel);
const TEXT = /\.(md|json|js|mjs|ts|tsx|vue|rs|toml|html|yml|yaml)$/;

/// The three names overlap as strings, so a plain substring replace renaming
/// one of them quietly corrupts the other two.
///
/// Rust and Cargo files name the crate or the repository and never the npm
/// package, so the npm rename skips them outright. Everywhere else the crate
/// still turns up in wasm filenames (`barqr_bg.wasm`) and doc examples
/// (`barqr::png`), and the repo in GitHub links — hold those aside, rename, put
/// them back. `--crate` and `--repo` then rename them deliberately, if asked.
const RUST = /\.(rs|toml)$/;
const CRATE_OR_REPO = new RegExp(
  [
    OLD_REPO,                                  // github.com/owner/barqr
    `${OLD_CRATE_SNAKE}(_bg)?\\.(js|wasm|d\\.ts)`, // barqr.js, barqr_bg.wasm
    `${OLD_CRATE_SNAKE}_`,                     // barqr_bg, other snake forms
    `${OLD_CRATE_SNAKE}::`,                    // use barqr::…
  ].join("|"),
  "g",
);

const holdAside = (text, pattern, rename) => {
  const held = [];
  const swapped = rename(
    text.replace(pattern, (m) => `\u0000${held.push(m) - 1}\u0000`),
  );
  return swapped.replace(/\u0000(\d+)\u0000/g, (_, i) => held[i]);
};

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
};
const dryRun = args.includes("--dry-run");

const npmName = arg("npm");
const crateName = arg("crate");
const repo = arg("repo");

if (!npmName) {
  console.error("usage: node scripts/rename.mjs --npm <name> [--crate <name>] [--repo <owner/repo>] [--dry-run]");
  process.exit(1);
}
if (crateName && !/^[a-z0-9][a-z0-9-]*$/.test(crateName)) {
  console.error(`--crate must be lowercase kebab-case, got ${crateName}`);
  process.exit(1);
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = relative(ROOT, full);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || SKIP_DIRS.has(rel)) continue;
      yield* walk(full);
    } else if (TEXT.test(entry.name) && !SKIP_FILES.has(entry.name) && !isPublishedNote(rel)) {
      yield full;
    }
  }
}

const replacements = [];
let changed = 0;

for await (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  const before = await readFile(file, "utf8");
  let after = before;

  // Every file gets the placeholder resolved.
  after = after.replaceAll("__NEW_PKG__", npmName);

  if (!PLACEHOLDER_ONLY.has(rel)) {
    // Rust and Cargo files name the crate, never the npm package.
    if (!RUST.test(rel)) {
      after = holdAside(after, CRATE_OR_REPO, (t) =>
        t.replaceAll(OLD_NPM, npmName));
    }
    if (repo) after = after.replaceAll(OLD_REPO, repo);
    if (crateName) {
      // The npm name starts with the crate name, so hold it aside or this
      // turns `barqrcode` into `<newcrate>code`.
      const npmNow = new RegExp(escape(npmName), "g");
      after = holdAside(after, npmNow, (t) =>
        t
          .replaceAll(OLD_CRATE_SNAKE, crateName.replaceAll("-", "_"))
          // Kebab last: the repo name contains it, and is already handled.
          .replaceAll(OLD_CRATE_KEBAB, crateName));
    }
  }

  if (after !== before) {
    const hits = before.split("\n").filter((l, i) => l !== after.split("\n")[i]).length;
    replacements.push(`  ${rel} (${hits} lines)`);
    changed++;
    if (!dryRun) await writeFile(file, after);
  }
}

console.log(replacements.join("\n"));
console.log(`\n  ${changed} files ${dryRun ? "would change" : "changed"}`);

console.log(`
  Not done by this script — each needs a person:

    1. npm  Settings -> Trusted Publisher: the workflow is bound to
            owner/repo/publish.yml. Renaming the repo breaks publishing until
            this matches.
    2. npm  deprecate the old package once the new one is live:
              npm deprecate ${OLD_NPM}@"*" "moved to ${npmName}"
            Deprecate, never unpublish — unpublishing breaks lockfiles.
    3. git  rename the GitHub repo, if you are renaming it. Links redirect;
            the trusted publisher does not.
    4.      bump the version, write the release notes, tag.
`);
