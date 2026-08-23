import { ref, shallowRef, toValue, watchEffect } from "vue";
import { barcodeModules } from "../index.web.js";
import { isBrowser } from "./shared.js";
import type { MaybeRefOrGetter } from "vue";
import type { BarcodeModules, BarcodeOptions } from "../index";

type MaybeRefBarcodeOptions = {
  [K in keyof BarcodeOptions]: MaybeRefOrGetter<BarcodeOptions[K]>;
};

/**
 * The bar pattern, for drawing the barcode yourself. Nothing to revoke.
 * The counterpart to {@link useQrModules}.
 */
export function useBarcodeModules(
  text: MaybeRefOrGetter<string | undefined>,
  opts: MaybeRefBarcodeOptions = {},
) {
  const modules = shallowRef<BarcodeModules | null>(null);
  const error = ref<unknown>(null);
  const loading = ref(false);

  watchEffect(async (onCleanup) => {
    const value = toValue(text);
    const options = {
      format: toValue(opts.format),
      moduleWidth: toValue(opts.moduleWidth),
      height: toValue(opts.height),
      quiet: toValue(opts.quiet),
    };

    if (!isBrowser || !value) return;

    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });

    try {
      loading.value = true;
      const result = await barcodeModules(value, options);
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
