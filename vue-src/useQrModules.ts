import { ref, shallowRef, toValue, watchEffect } from "vue";
import { qrModules } from "../index.web.js";
import { isBrowser, type MaybeRefOptions } from "./shared.js";
import type { MaybeRefOrGetter } from "vue";
import type { QrModules } from "../index";

/**
 * The module grid, for drawing the code yourself — a `<canvas>`, an inline
 * `<svg>` that inherits `currentColor`, a PDF.
 *
 * Nothing here allocates a Blob or an object URL, so there is no lifetime to
 * manage.
 */
export function useQrModules(
  text: MaybeRefOrGetter<string | undefined>,
  opts: MaybeRefOptions = {},
) {
  const modules = shallowRef<QrModules | null>(null);
  const error = ref<unknown>(null);
  const loading = ref(false);

  watchEffect(async (onCleanup) => {
    const value = toValue(text);
    const options = {
      size: toValue(opts.size),
      margin: toValue(opts.margin),
      ecc: toValue(opts.ecc),
      sizeMode: toValue(opts.sizeMode),
      logoSpace: toValue(opts.logoSpace),
    };

    if (!isBrowser || !value) return;

    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });

    try {
      loading.value = true;
      const result = await qrModules(value, options);
      if (!cancelled) {
        modules.value = result;
        error.value = null;
      }
    } catch (e) {
      if (!cancelled) {
        error.value = e;
        modules.value = null;
      }
    } finally {
      if (!cancelled) loading.value = false;
    }
  });

  return { modules, error, loading };
}
