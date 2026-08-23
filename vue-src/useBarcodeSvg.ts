import { ref, toValue, watchEffect } from "vue";
import { barcodeSvg } from "../index.web.js";
import { isBrowser } from "./shared.js";
import type { MaybeRefOrGetter } from "vue";
import type { BarcodeSvgOptions } from "../index";

type MaybeRefBarcodeSvgOptions = {
  [K in keyof BarcodeSvgOptions]: MaybeRefOrGetter<BarcodeSvgOptions[K]>;
};

/**
 * A 1D barcode as SVG, with the data printed under the bars where the
 * symbology conventionally shows it. Nothing to revoke, and it scales cleanly.
 */
export function useBarcodeSvg(
  text: MaybeRefOrGetter<string | undefined>,
  opts: MaybeRefBarcodeSvgOptions = {},
) {
  const svg = ref<string | null>(null);
  const error = ref<unknown>(null);
  const loading = ref(false);

  watchEffect(async (onCleanup) => {
    const value = toValue(text);
    const options = {
      format: toValue(opts.format),
      moduleWidth: toValue(opts.moduleWidth),
      height: toValue(opts.height),
      quiet: toValue(opts.quiet),
      text: toValue(opts.text),
    };

    if (!isBrowser || !value) return;

    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });

    try {
      loading.value = true;
      const markup = await barcodeSvg(value, options);
      if (!cancelled) {
        svg.value = markup;
        error.value = null;
      }
    } catch (e) {
      if (!cancelled) {
        error.value = e;
        svg.value = null;
      }
    } finally {
      if (!cancelled) loading.value = false;
    }
  });

  return { svg, error, loading };
}
