import type { NextConfig } from "next";

// Deliberately empty: this package needs no bundler configuration.
//
// It used to need `serverExternalPackages`, because wasm-pack's Node glue reads
// its binary with `readFileSync(__dirname + "/…")` and bundling rewrites
// `__dirname`. That fix caused a worse problem — an externalized copy of the
// React hooks resolves its own `react`, so every client component using them
// died during SSR with a null hook dispatcher. The binary is inlined at build
// time instead, so neither workaround is needed.
const nextConfig: NextConfig = {};

export default nextConfig;
