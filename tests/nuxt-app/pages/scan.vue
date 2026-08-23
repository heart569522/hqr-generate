<script setup lang="ts">
// Camera scanning through the Vue composable.
//
// "Simulated camera" swaps getUserMedia for a canvas-backed MediaStream, so the
// whole pump/decode/dedupe path runs on a machine without a camera — and in
// headless CI.
import { ref, watch } from "vue";
import { qrModules } from "barqr";
import { useScanner } from "barqr/vue";

const SAMPLES = ["https://example.com/scanned", "สวัสดีครับ ทดสอบภาษาไทย"];

const enabled = ref(false);
const sample = ref(0);
const log = ref<string[]>([]);

let restore: (() => void) | null = null;
let repaint: ((text: string) => Promise<void>) | null = null;

async function useFakeCamera() {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  let modules = await qrModules(SAMPLES[0], { size: 400 });
  const paint = () => {
    const { n, scale, size, origin, dark } = modules;
    if (canvas.width !== size) canvas.width = canvas.height = size;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#000";
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        if (dark[y * n + x]) ctx.fillRect(origin + x * scale, origin + y * scale, scale, scale);
  };

  paint();
  // setInterval, not requestAnimationFrame: rAF is paused in a background tab,
  // which would freeze the fake camera on its first frame — and headless CI
  // runs in exactly that state.
  const timer = setInterval(paint, 100);

  const stream = canvas.captureStream(15);
  const real = navigator.mediaDevices;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { ...real, getUserMedia: async () => stream },
  });

  repaint = async (text: string) => {
    modules = await qrModules(text, { size: 400 });
    paint();
  };
  restore = () => {
    clearInterval(timer);
    for (const t of stream.getTracks()) t.stop();
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: real });
    repaint = null;
  };
}

const { video, result, error, running } = useScanner({
  enabled,
  onResult: (r) => {
    log.value = [`${new Date().toLocaleTimeString()}  ${r.text}`, ...log.value].slice(0, 6);
  },
});

async function startFake() {
  await useFakeCamera();
  enabled.value = true;
}
function stop() {
  enabled.value = false;
  restore?.();
  restore = null;
}
watch(sample, (i) => repaint?.(SAMPLES[i]));

onBeforeUnmount(stop);
</script>

<template>
  <div>
    <h1 style="font-size: 1.2rem">Camera scanner</h1>
    <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem">
      <button data-testid="start-fake" @click="startFake">simulated camera</button>
      <button data-testid="next-payload" @click="sample = (sample + 1) % SAMPLES.length">
        next payload
      </button>
      <button @click="stop">stop</button>
    </div>
    <p data-testid="sample">sample: {{ sample }}</p>
    <p data-testid="status">status: {{ running ? "scanning" : enabled ? "starting…" : "idle" }}</p>
    <p v-if="error" style="color: #c0261a">
      {{ (error as { code?: string }).code }} — {{ (error as Error).message }}
    </p>
    <video ref="video" playsinline muted style="width: 220px; background: #000" />
    <p v-if="result" data-testid="latest" style="color: #0a7d32; word-break: break-all">
      latest: {{ result.text }}
    </p>
    <ul data-testid="log">
      <li v-for="(line, i) in log" :key="i">{{ line }}</li>
    </ul>
  </div>
</template>
