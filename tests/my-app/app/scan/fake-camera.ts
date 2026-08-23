// A stand-in camera, for machines that do not have one.
//
// `canvas.captureStream()` produces a real MediaStream, so swapping it in for
// `getUserMedia` exercises the entire scanner path — frame pump, downscale,
// decode, de-duplication, teardown — with nothing faked downstream of the
// stream itself.
import { qrModules } from "barqrcode";

export interface FakeCamera {
  /** Undo the getUserMedia patch and stop repainting. */
  restore: () => void;
  /** Swap in a different payload while the scanner is running. */
  setText: (text: string) => Promise<void>;
}

export async function installFakeCamera(initialText: string): Promise<FakeCamera> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  let modules = await qrModules(initialText, { size: 480 });

  const paint = () => {
    const { n, scale, size, origin, dark } = modules;
    if (canvas.width !== size) canvas.width = canvas.height = size;

    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#000";
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (dark[y * n + x]) {
          ctx.fillRect(origin + x * scale, origin + y * scale, scale, scale);
        }
      }
    }
  };

  paint();

  // captureStream only emits frames while the canvas is being drawn to.
  let painting = true;
  const loop = () => {
    if (!painting) return;
    paint();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  const stream = canvas.captureStream(15);
  const real = navigator.mediaDevices;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { ...real, getUserMedia: async () => stream },
  });

  return {
    restore: () => {
      painting = false;
      for (const track of stream.getTracks()) track.stop();
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: real });
    },
    setText: async (text: string) => {
      modules = await qrModules(text, { size: 480 });
    },
  };
}
