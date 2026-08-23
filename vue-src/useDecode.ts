import { ref, toValue, watchEffect } from "vue";
import { decode } from "../index.web.js";
import { isBrowser } from "./shared.js";
import type { MaybeRefOrGetter } from "vue";

/**
 * Read a QR code out of image bytes or an `ImageData`.
 *
 * Tracks the input by identity on purpose: consecutive camera frames have the
 * same dimensions and often nearly the same bytes, so any cheaper signature
 * would decode the first frame and then go quiet.
 */
export function useDecode(input: MaybeRefOrGetter<Uint8Array | ImageData | undefined>) {
  const text = ref<string | null>(null);
  const error = ref<unknown>(null);
  const loading = ref(false);

  watchEffect(async (onCleanup) => {
    const value = toValue(input);
    if (!isBrowser || !value) return;

    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });

    try {
      loading.value = true;
      const result = await decode(value);
      if (!cancelled) {
        text.value = result;
        error.value = null;
      }
    } catch (e) {
      if (!cancelled) {
        error.value = e;
        text.value = null;
      }
    } finally {
      if (!cancelled) loading.value = false;
    }
  });

  return { text, error, loading };
}
