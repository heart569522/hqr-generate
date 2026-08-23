import { onScopeDispose, ref, shallowRef, toValue, watch } from "vue";
import { createScanner } from "../scanner.js";
import { isBrowser } from "./shared.js";
import type { MaybeRefOrGetter, Ref } from "vue";
import type { DecodedQr } from "../index";

export interface UseQrScannerOptions {
  /** Start the camera. Set false to release it without unmounting. */
  enabled?: MaybeRefOrGetter<boolean>;
  /** Called for every code seen, after de-duplication. */
  onResult?: (result: DecodedQr) => void;
  facingMode?: MaybeRefOrGetter<"environment" | "user">;
  deviceId?: MaybeRefOrGetter<string | undefined>;
  /** Minimum gap between decode attempts. Default 120 ms. */
  scanIntervalMs?: MaybeRefOrGetter<number | undefined>;
  /** Longest edge of the buffer actually decoded. Default 640 px. */
  maxSide?: MaybeRefOrGetter<number | undefined>;
  /** How long the same text is suppressed after a hit. Default 1500 ms. */
  dedupeMs?: MaybeRefOrGetter<number | undefined>;
}

/**
 * Live QR scanning from the device camera.
 *
 * ```vue
 * <script setup>
 * const { video, result, error } = useQrScanner({ onResult: (r) => console.log(r.text) })
 * </script>
 * <template><video ref="video" playsinline muted /></template>
 * ```
 *
 * The camera is released when the scope is disposed and whenever `enabled`
 * goes false. Needs a secure context — https, or localhost.
 */
export function useQrScanner(opts: UseQrScannerOptions = {}) {
  // Named `video` so `<video ref="video">` binds by convention in <script setup>.
  const video = ref<HTMLVideoElement | null>(null) as Ref<HTMLVideoElement | null>;
  const result = shallowRef<DecodedQr | null>(null);
  const error = ref<unknown>(null);
  const running = ref(false);

  let scanner: { stop: () => void } | null = null;

  const stop = () => {
    scanner?.stop();
    scanner = null;
    running.value = false;
  };

  watch(
    () => [
      toValue(opts.enabled ?? true),
      video.value,
      toValue(opts.facingMode ?? "environment"),
      toValue(opts.deviceId),
      toValue(opts.scanIntervalMs),
      toValue(opts.maxSide),
      toValue(opts.dedupeMs),
    ],
    async ([enabled, element], _prev, onCleanup) => {
      stop();
      if (!isBrowser || !enabled || !element) return;

      let cancelled = false;
      onCleanup(() => {
        cancelled = true;
      });

      try {
        const started = await createScanner({
          video: element as HTMLVideoElement,
          facingMode: toValue(opts.facingMode ?? "environment"),
          deviceId: toValue(opts.deviceId),
          scanIntervalMs: toValue(opts.scanIntervalMs),
          maxSide: toValue(opts.maxSide),
          dedupeMs: toValue(opts.dedupeMs),
          onResult: (r: DecodedQr) => {
            result.value = r;
            // Read through the options object rather than capturing the
            // callback, so replacing it does not require restarting the camera.
            opts.onResult?.(r);
          },
          onError: (e: unknown) => {
            error.value = e;
          },
        });

        if (cancelled) {
          started.stop();
          return;
        }
        scanner = started;
        error.value = null;
        running.value = true;
      } catch (e) {
        if (!cancelled) {
          error.value = e;
          running.value = false;
        }
      }
    },
    { immediate: true },
  );

  onScopeDispose(stop);

  return { video, result, error, running, stop };
}
