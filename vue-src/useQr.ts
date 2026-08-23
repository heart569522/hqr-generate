import { onScopeDispose, ref, shallowRef, toValue, watchEffect } from "vue";
import { qrPng } from "../index.web.js";
import { isBrowser, type MaybeRefOptions } from "./shared.js";
import type { MaybeRefOrGetter } from "vue";

/**
 * A QR code as PNG bytes, plus an object URL ready for `<img :src>`.
 *
 * The URL is revoked when the source changes and when the scope is disposed,
 * so nothing leaks if the component unmounts mid-generation.
 *
 * ```vue
 * <script setup>
 * const { src } = useQr(() => props.url, { size: 320 })
 * </script>
 * <template><img v-if="src" :src="src" alt="QR code"></template>
 * ```
 */
export function useQr(
  text: MaybeRefOrGetter<string | undefined>,
  opts: MaybeRefOptions = {},
) {
  const src = ref<string | null>(null);
  // shallowRef: a Uint8Array has nothing worth making reactive, and deep
  // tracking a few thousand bytes would cost real time.
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
    // Read every option through toValue so the effect tracks each of them.
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
      const result = await qrPng(value, options);
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
