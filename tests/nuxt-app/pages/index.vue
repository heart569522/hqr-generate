<script setup lang="ts">
// Client-side surface. Every import goes through the package name, so this
// exercises the real `exports` map the way a user's app would.
import { ref, watchEffect } from "vue";
import { decode, decodeAll, qrMany, qrPng } from "barqr";
import { promptpay, wifi } from "barqr/payload";
import {
  useDecode,
  useQr,
  useQrModules,
  useQrSvg,
} from "barqr/vue";

const text = ref("https://example.com/nuxt");
const size = ref(240);

const png = useQr(text, { size, ecc: "H" });
const svg = useQrSvg(text, { size, ecc: "H", logoSpace: 20 });
const grid = useQrModules(text, { size });

// Feed useDecode the bytes the generator just produced.
const source = ref<Uint8Array | undefined>();
watchEffect(() => {
  source.value = png.bytes.value ?? undefined;
});
const decoded = useDecode(source);

type Check = { name: string; ok: boolean; detail: string };
const checks = ref<Check[] | null>(null);

onMounted(async () => {
  const results: Check[] = [];
  const run = async (name: string, fn: () => Promise<string>) => {
    try {
      results.push({ name, ok: true, detail: await fn() });
    } catch (e) {
      results.push({ name, ok: false, detail: String((e as Error)?.message ?? e) });
    }
  };

  await run("qrPng round trip", async () => {
    const bytes = await qrPng("https://example.com/nuxt-direct", { size: 320 });
    const back = await decode(bytes);
    if (back !== "https://example.com/nuxt-direct") throw new Error(back);
    return `${bytes.length} bytes`;
  });

  await run("qrMany", async () => {
    const batch = await qrMany(["a", "b", "c"], { size: 120 });
    return `${batch.length} codes`;
  });

  await run("decodeAll positions", async () => {
    const [first] = await decodeAll(await qrPng("positioned", { size: 300 }));
    return `v${first.version}, ${first.corners.length} corners`;
  });

  await run("payload builders", async () => {
    const pp = promptpay({ target: "081-234-5678", amount: 250 });
    if ((await decode(await qrPng(pp, { ecc: "M" }))) !== pp) throw new Error("mismatch");
    wifi({ ssid: "Cafe; Free", password: "hunter2" });
    return pp.slice(0, 24) + "…";
  });

  await run("typed errors", async () => {
    try {
      await qrPng("x", { ecc: "L", logoSpace: 30 });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== "LOGO_SPACE_TOO_LARGE") throw new Error(String(code));
      return code;
    }
    throw new Error("expected a throw");
  });

  checks.value = results;
});

const failed = computed(() => checks.value?.filter((c) => !c.ok).length ?? 0);
</script>

<template>
  <div>
    <h1 style="font-size: 1.2rem">Nuxt client checks</h1>

    <p v-if="!checks">running…</p>
    <p v-else :style="{ color: failed ? '#c0261a' : '#0a7d32' }" data-testid="summary">
      {{ checks.length - failed }}/{{ checks.length }} passed
    </p>
    <ol>
      <li v-for="c in checks ?? []" :key="c.name" :style="{ color: c.ok ? '#0a7d32' : '#c0261a' }">
        {{ c.ok ? "PASS" : "FAIL" }} — {{ c.name }} · {{ c.detail }}
      </li>
    </ol>

    <p data-testid="composables">
      useQr: {{ png.src.value ? "ok" : "…" }} ·
      useQrSvg: {{ svg.svg.value ? "ok" : "…" }} ·
      useQrModules: {{ grid.modules.value ? `${grid.modules.value.n}×${grid.modules.value.n}` : "…" }} ·
      useDecode: {{ decoded.text.value ?? "…" }}
    </p>

    <div style="display: flex; gap: 1rem; align-items: start">
      <img v-if="png.src.value" :src="png.src.value" width="140" alt="QR from useQr" />
      <div v-if="svg.svg.value" style="width: 140px" v-html="svg.svg.value" />
    </div>

    <button style="margin-top: 1rem" @click="text = 'https://example.com/changed-' + Date.now()">
      change the payload (proves reactivity)
    </button>
  </div>
</template>
