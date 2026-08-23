<script setup lang="ts">
// Server-rendered. `useAsyncData` runs on the server during SSR, where the
// package resolves to its Node build and every call is synchronous — so the QR
// markup arrives in the HTML with no client JS and no layout shift.
//
// This is also the path that broke in Next.js: Nitro bundles server code, and
// wasm-pack's glue used to locate its binary through `__dirname`.
const { data } = await useAsyncData("qr", async () => {
  const { decode, generateModules, generatePng, generateSvg } = await import(
    "barqr"
  );
  const { promptpay } = await import("barqr/payload");

  const url = "https://example.com/rendered-on-the-server";
  const payload = promptpay({ target: "081-234-5678", amount: 199.5 });

  return {
    svg: generateSvg(url, { size: 200 }),
    promptpaySvg: generateSvg(payload, { size: 200, ecc: "M" }),
    payload,
    grid: (({ n, version, size }) => ({ n, version, size }))(
      generateModules(url, { size: 200 }),
    ),
    // Proves the decoder loads and works inside Nitro too.
    roundTrip: decode(generatePng(url)) === url,
  };
});
</script>

<template>
  <div>
    <h1 style="font-size: 1.2rem">Server-rendered</h1>
    <p :style="{ color: data?.roundTrip ? '#0a7d32' : '#c0261a' }" data-testid="ssr-roundtrip">
      {{ data?.roundTrip ? "PASS" : "FAIL" }} — decode() round trip on the server
    </p>
    <p data-testid="ssr-grid">
      modules: {{ data?.grid.n }}×{{ data?.grid.n }} (v{{ data?.grid.version }}), image
      {{ data?.grid.size }}px
    </p>
    <div style="display: flex; gap: 1.5rem">
      <div style="width: 200px" v-html="data?.svg" />
      <div>
        <div style="width: 200px" v-html="data?.promptpaySvg" />
        <small style="word-break: break-all">{{ data?.payload }}</small>
      </div>
    </div>
  </div>
</template>
