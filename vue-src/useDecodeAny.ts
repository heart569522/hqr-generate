import { ref, toValue, watchEffect } from "vue";
import { decodeAny } from "../index.web.js";
import { isBrowser } from "./shared.js";
import type { MaybeRefOrGetter } from "vue";

/**
 * Read a symbol of any supported symbology out of `input`.
 *
 * Loads a decoder roughly twice the size of the one {@link useDecode} uses.
 * Tracks `input` by identity, for the same reason {@link useDecode} does.
 */
export function useDecodeAny(input: MaybeRefOrGetter<Uint8Array | ImageData | undefined>) {
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
      const result = await decodeAny(value);
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
