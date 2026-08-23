// The composables have to survive server-side rendering.
//
// This is where Vue differs sharply from React: `watchEffect` runs immediately,
// including during SSR, while React's `useEffect` never runs on the server. A
// composable that reached for `fetch` or `URL.createObjectURL` would take down
// every Nuxt page that used it — during render, before hydration could help.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { defineComponent, h, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { createSSRApp } from "vue";

import {
  useDecode,
  useGenerate,
  useGenerateModules,
  useGenerateSvg,
  useQrScanner,
} from "../../vue/index.js";

/** Render a component to an HTML string the way Nuxt would. */
const ssr = (setup) =>
  renderToString(createSSRApp(defineComponent({ setup, render: () => h("div") })));

test("useGenerate renders on the server without touching browser APIs", async () => {
  const html = await ssr(() => {
    const { src, bytes, error, loading } = useGenerate("https://example.com", { size: 320 });
    // Nothing should have run yet — generation is deferred to the client.
    assert.equal(src.value, null);
    assert.equal(bytes.value, null);
    assert.equal(error.value, null);
    assert.equal(loading.value, false);
    return {};
  });
  assert.equal(html, "<div></div>");
});

test("every composable is SSR-safe", async () => {
  await ssr(() => {
    useGenerate("x");
    useGenerateSvg("x", { logoSpace: 20, ecc: "H" });
    useGenerateModules("x");
    useDecode(new Uint8Array([1, 2, 3]));
    useQrScanner({ enabled: true });
    return {};
  });
});

test("composables accept refs and getters, not just plain values", async () => {
  await ssr(() => {
    const text = ref("https://example.com");
    const size = ref(320);
    // A getter is the idiomatic way to forward a prop.
    const { src } = useGenerate(
      () => text.value,
      { size: () => size.value, ecc: "H" },
    );
    assert.equal(src.value, null);
    return {};
  });
});

test("useQrScanner exposes a video ref and stays idle on the server", async () => {
  await ssr(() => {
    const { video, running, result } = useQrScanner();
    assert.equal(video.value, null);
    assert.equal(running.value, false);
    assert.equal(result.value, null);
    return {};
  });
});
