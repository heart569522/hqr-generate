"use client";

import { useEffect, useState } from "react";
import { barcodeModules } from "../index.web.js";
import type { BarcodeModules, BarcodeOptions } from "../index";

/**
 * The bar pattern, for drawing the barcode yourself — a `<canvas>`, an inline
 * `<svg>` that inherits `currentColor`, a label layout.
 *
 * Nothing here allocates a Blob or an object URL, so there is no lifetime to
 * manage. The counterpart to {@link useQrModules}.
 */
export function useBarcodeModules(text?: string, opts?: BarcodeOptions) {
  const [modules, setModules] = useState<BarcodeModules | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const format = opts?.format;
  const moduleWidth = opts?.moduleWidth;
  const height = opts?.height;
  const quiet = opts?.quiet;

  useEffect(() => {
    if (!text) return;

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        const result = await barcodeModules(text, { format, moduleWidth, height, quiet });
        if (!cancelled) {
          setModules(result);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e);
          setModules(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [text, format, moduleWidth, height, quiet]);

  return { modules, error, loading };
}
