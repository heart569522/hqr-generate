<script setup lang="ts">
// Barcodes through the Vue composables, in Nuxt.
import { ref } from "vue";
import { useBarcode, useBarcodeSvg } from "barqrcode/vue";

const FORMATS: [string, string][] = [
  ["code128", "HELLO-123"],
  ["code39", "HELLO 123"],
  ["code93", "HELLO123"],
  ["codabar", "A12345B"],
  ["ean13", "012345678901"],
  ["ean8", "1234567"],
  ["itf", "12345678"],
];

const sku = ref("SKU-0001");
const live = useBarcodeSvg(sku, { format: "code128", text: true });

// One composable per row: barcodes have no batch API, and a row is cheap.
const rows = FORMATS.map(([format, data]) => ({
  format,
  data,
  png: useBarcode(data, { format: format as never, height: 60 }),
  svg: useBarcodeSvg(data, { format: format as never, height: 60 }),
}));
</script>

<template>
  <div>
    <h1 style="font-size: 1.2rem">Barcodes</h1>

    <section style="margin-bottom: 1.5rem">
      <label style="display: block; opacity: 0.6; margin-bottom: 0.4rem">
        live (Code 128, digits shown)
      </label>
      <input v-model="sku" style="width: 100%; padding: 0.4rem; margin-bottom: 0.6rem" />
      <p v-if="live.error.value" style="color: #c0261a" data-testid="live-error">
        {{ (live.error.value as { code?: string }).code }}
      </p>
      <div v-else-if="live.svg.value" data-testid="live" v-html="live.svg.value" />
    </section>

    <section>
      <div
        v-for="row in rows"
        :key="row.format"
        style="display: flex; align-items: center; gap: 1.5rem; padding: 0.6rem 0; border-bottom: 1px solid #0002"
      >
        <code style="width: 9rem; flex-shrink: 0">{{ row.format }}</code>
        <span style="width: 8rem; flex-shrink: 0; opacity: 0.6">{{ row.data }}</span>
        <span v-if="row.png.error.value" style="color: #c0261a">
          {{ (row.png.error.value as Error).message }}
        </span>
        <template v-else>
          <img v-if="row.png.src.value" :src="row.png.src.value" style="height: 4rem" :alt="row.format" />
          <div v-if="row.svg.svg.value" style="height: 4rem" v-html="row.svg.svg.value" />
        </template>
      </div>
    </section>
  </div>
</template>
