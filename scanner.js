// Live camera scanning, framework-agnostic.
//
// The decoder itself was always the easy part — the work is everything around
// it: asking for the camera, keeping the video element alive, pulling frames at
// a sane rate, downscaling so a 1080p frame does not cost 40 ms to decode, and
// not firing the same result sixty times a second.
//
// Decoding runs on the main thread, throttled by `scanIntervalMs`. At the
// default 640 px working size that is a few milliseconds per frame; raise the
// interval before reaching for a worker.

import { decodeAll } from "./index.web.js";

function scannerError(code, message, cause) {
  const err = new Error(message);
  err.code = code;
  if (cause) err.cause = cause;
  return err;
}

/** Cameras the browser is willing to name. Labels require prior permission. */
export async function listCameras() {
  if (!navigator?.mediaDevices?.enumerateDevices) {
    throw scannerError("CAMERA_UNAVAILABLE", "this browser has no mediaDevices API");
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === "videoinput")
    .map((d) => ({ deviceId: d.deviceId, label: d.label }));
}

async function openCamera({ facingMode, deviceId }) {
  if (!navigator?.mediaDevices?.getUserMedia) {
    throw scannerError(
      "CAMERA_UNAVAILABLE",
      "getUserMedia is unavailable — camera access needs a secure context (https or localhost)",
    );
  }

  const video = deviceId
    ? { deviceId: { exact: deviceId } }
    : { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } };

  try {
    return await navigator.mediaDevices.getUserMedia({ video, audio: false });
  } catch (cause) {
    const denied = cause?.name === "NotAllowedError" || cause?.name === "SecurityError";
    throw scannerError(
      denied ? "CAMERA_DENIED" : "CAMERA_UNAVAILABLE",
      denied ? "camera permission was denied" : `could not open the camera: ${cause?.message ?? cause}`,
      cause,
    );
  }
}

/**
 * Start scanning into `video`, calling `onResult` for each code seen.
 *
 * @param {{
 *   video: HTMLVideoElement,
 *   onResult: (result: { text: string, version: number, corners: {x:number,y:number}[] }) => void,
 *   onError?: (error: Error) => void,
 *   facingMode?: 'environment' | 'user',
 *   deviceId?: string,
 *   scanIntervalMs?: number,
 *   maxSide?: number,
 *   dedupeMs?: number,
 * }} opts
 * @returns {Promise<{ stop: () => void, stream: MediaStream }>}
 */
export async function createScanner({
  video,
  onResult,
  onError,
  facingMode = "environment",
  deviceId,
  scanIntervalMs = 120,
  maxSide = 640,
  dedupeMs = 1500,
} = {}) {
  if (!video || typeof video.play !== "function") {
    throw scannerError("INVALID_OPTION", "createScanner needs a <video> element");
  }
  if (typeof onResult !== "function") {
    throw scannerError("INVALID_OPTION", "createScanner needs an onResult callback");
  }

  const stream = await openCamera({ facingMode, deviceId });

  let stopped = false;
  let frameHandle = null;
  let timerHandle = null;
  let lastScan = 0;
  const seen = new Map();

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (frameHandle != null && video.cancelVideoFrameCallback) {
      video.cancelVideoFrameCallback(frameHandle);
    }
    if (timerHandle != null) clearTimeout(timerHandle);
    for (const track of stream.getTracks()) track.stop();
    if (video.srcObject === stream) video.srcObject = null;
  };

  const emit = (result, scale) => {
    const now = performance.now();
    const last = seen.get(result.text);
    if (last != null && now - last < dedupeMs) return;
    seen.set(result.text, now);

    // Drop stale entries so a long session does not grow this forever.
    if (seen.size > 64) {
      for (const [text, at] of seen) {
        if (now - at > dedupeMs) seen.delete(text);
      }
    }

    onResult({
      ...result,
      // Report corners in the video's own coordinates, not the scaled-down
      // buffer we decoded — callers overlay them on the video element.
      corners: result.corners.map((c) => ({ x: c.x / scale, y: c.y / scale })),
    });
  };

  const scanFrame = async () => {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    const scale = Math.min(1, maxSide / Math.max(vw, vh));
    const w = Math.max(1, Math.round(vw * scale));
    const h = Math.max(1, Math.round(vh * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    ctx.drawImage(video, 0, 0, w, h);

    try {
      const results = await decodeAll(ctx.getImageData(0, 0, w, h));
      if (stopped) return;
      for (const result of results) emit(result, scale);
    } catch (err) {
      // No code in frame is the normal case, not a failure worth reporting.
      if (err?.code === "QR_NOT_FOUND" || err?.code === "QR_CORRUPT") return;
      onError?.(err);
    }
  };

  const pump = async () => {
    if (stopped) return;

    const now = performance.now();
    if (now - lastScan >= scanIntervalMs) {
      lastScan = now;
      await scanFrame();
    }
    if (stopped) return;

    if (video.requestVideoFrameCallback) {
      frameHandle = video.requestVideoFrameCallback(() => void pump());
    } else {
      timerHandle = setTimeout(() => void pump(), scanIntervalMs);
    }
  };

  video.srcObject = stream;
  video.setAttribute("playsinline", "");
  video.muted = true;

  try {
    await video.play();
  } catch (cause) {
    stop();
    throw scannerError("CAMERA_UNAVAILABLE", `video playback was blocked: ${cause?.message}`, cause);
  }

  void pump();

  return { stop, stream };
}
