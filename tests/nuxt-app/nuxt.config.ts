export default defineNuxtConfig({
  // Deliberately empty. The package should need no Nitro externals, no
  // transpile entry, nothing. If this file ever grows an entry for
  // barqrcode, that is a bug in the package, not a fix here.
  compatibilityDate: "2026-01-01",
  devtools: { enabled: false },
});
