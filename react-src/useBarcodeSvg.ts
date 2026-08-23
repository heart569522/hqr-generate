"use client";

import { useEffect, useState } from "react";
import { barcodeSvg } from "../index.web.js";
import type { BarcodeSvgOptions } from "../index";

/**
 * A 1D barcode as SVG markup, with the data printed under the bars where the
 * symbology conventionally shows it (EAN and UPC do; Code 128 does not).
 *
 * Prefer this over {@link useBarcode} when the digits matter — a retail label
 * without them is not much use to a human when the scanner fails.
 */
export function useBarcodeSvg(text?: string, opts?: BarcodeSvgOptions) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const format = opts?.format;
  const moduleWidth = opts?.moduleWidth;
  const height = opts?.height;
  const quiet = opts?.quiet;
  const showText = opts?.text;

  useEffect(() => {
    if (!text) return;

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        const markup = await barcodeSvg(text, {
          format,
          moduleWidth,
          height,
          quiet,
          text: showText,
        });
        if (!cancelled) {
          setSvg(markup);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e);
          setSvg(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [text, format, moduleWidth, height, quiet, showText]);

  return { svg, error, loading };
}
