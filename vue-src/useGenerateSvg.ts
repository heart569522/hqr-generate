import { onScopeDispose, ref, toValue, watchEffect } from "vue";
import { generateSvg } from "../index.web.js";
import { isBrowser, type MaybeRefOptions } from "./shared.js";
import type { MaybeRefOrGetter } from "vue";
import type { SvgOptions } from "../index";

type MaybeRefSvgOptions = MaybeRefOptions & {
  logo?: MaybeRefOrGetter<SvgOptions["logo"]>;
};

/**
 * A QR code as SVG markup, plus an object URL for `<img :src>`.
 *
 * Prefer `svg` with `v-html` when you want the markup in the DOM — it scales
 * without blurring and inherits nothing from an `<img>` boundary.
 */
export function useGenerateSvg(
  text: MaybeRefOrGetter<string | undefined>,
  opts: MaybeRefSvgOptions = {},
) {
  const svg = ref<string | null>(null);
  const src = ref<string | null>(null);
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
    const options = {
      size: toValue(opts.size),
      margin: toValue(opts.margin),
      ecc: toValue(opts.ecc),
      sizeMode: toValue(opts.sizeMode),
      logoSpace: toValue(opts.logoSpace),
      logo: toValue(opts.logo),
    };

    if (!isBrowser || !value) return;

    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });

    try {
      loading.value = true;
      const markup = await generateSvg(value, options);
      if (cancelled) return;

      release();
      svg.value = markup;
      objectUrl = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
      src.value = objectUrl;
      error.value = null;
    } catch (e) {
      if (!cancelled) {
        error.value = e;
        svg.value = null;
        src.value = null;
      }
    } finally {
      if (!cancelled) loading.value = false;
    }
  });

  onScopeDispose(release);

  return { svg, src, error, loading };
}
