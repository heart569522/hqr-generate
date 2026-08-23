import { onScopeDispose, ref, shallowRef, toValue, watchEffect } from "vue";
import { barcodePng } from "../index.web.js";
import { isBrowser } from "./shared.js";
import type { MaybeRefOrGetter } from "vue";
import type { BarcodeOptions } from "../index";

type MaybeRefBarcodeOptions = {
  [K in keyof BarcodeOptions]: MaybeRefOrGetter<BarcodeOptions[K]>;
};

/**
 * A 1D barcode as PNG bytes, plus an object URL for `<img :src>`.
 *
 * ```vue
 * <script setup>
 * const { src } = useBarcode(() => props.sku, { format: "code128" })
 * </script>
 * ```
 *
 * PNG output carries no human-readable digits — drawing text means shipping a
 * font. Use {@link useBarcodeSvg} when they matter.
 */
export function useBarcode(
  text: MaybeRefOrGetter<string | undefined>,
  opts: MaybeRefBarcodeOptions = {},
) {
  const src = ref<string | null>(null);
  const bytes = shallowRef<Uint8Array | null>(null);
  const error = ref<unknown>(null);
  const loading = ref(false);

  let objectUrl: string | null = null;
  const release = () => {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  };

  watchEffect(async (onCleanup) => {
    const value = toValue(text);
    // Read each option through toValue *inside* the effect — that is what makes
    // the effect track them.
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
      const result = await barcodePng(value, options);
      if (cancelled) return;

      release();
      bytes.value = result;
      objectUrl = URL.createObjectURL(new Blob([result as BlobPart], { type: "image/png" }));
      src.value = objectUrl;
      error.value = null;
    } catch (e) {
      if (!cancelled) {
        error.value = e;
        src.value = null;
      }
    } finally {
      if (!cancelled) loading.value = false;
    }
  });

  onScopeDispose(release);

  return { src, bytes, error, loading };
}
