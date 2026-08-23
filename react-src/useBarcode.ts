"use client";

import { useEffect, useState } from "react";
import { generateBarcodePng } from "../index.web.js";
import type { BarcodeOptions } from "../index";

/**
 * A 1D barcode as PNG bytes, plus an object URL ready for `<img src>`.
 *
 * ```tsx
 * const { src } = useBarcode(sku, { format: "code128" });
 * ```
 *
 * The URL is revoked on cleanup. For the human-readable digits under the bars,
 * use {@link useBarcodeSvg} — PNG output has no text, because drawing text
 * means shipping a font.
 */
export function useBarcode(text?: string, opts?: BarcodeOptions) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  // Primitive deps, so an inline `{ format: "code128" }` does not re-run WASM
  // on every render. New option? Add it here *and* to the dep array.
  const format = opts?.format;
  const moduleWidth = opts?.moduleWidth;
  const height = opts?.height;
  const quiet = opts?.quiet;

  useEffect(() => {
    if (!text) return;

    let cancelled = false;
    let objectUrl: string | null = null;

    (async () => {
      try {
        setLoading(true);
        const result = await generateBarcodePng(text, { format, moduleWidth, height, quiet });
        if (cancelled) return;

        setBytes(result);
        const blob = new Blob([result as BlobPart], { type: "image/png" });
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e);
          setSrc(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [text, format, moduleWidth, height, quiet]);

  return { src, bytes, error, loading };
}
