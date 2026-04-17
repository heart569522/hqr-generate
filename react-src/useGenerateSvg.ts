"use client";

import { useEffect, useState } from "react";
import { generate_svg } from "../index.web.js";
import type { GenerateOptions } from "../index";

export function useGenerateSvg(
  text?: string,
  opts?: GenerateOptions
) {
  const [svg, setSvg] = useState<string | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // Primitive deps so inline `opts` objects don't re-trigger WASM every render.
  const size = opts?.size;
  const margin = opts?.margin;
  const ecc = opts?.ecc;

  useEffect(() => {
    if (!text) return;

    let cancelled = false;
    let objectUrl: string | null = null;

    (async () => {
      try {
        setLoading(true);

        const markup = await generate_svg(text, { size, margin, ecc });
        if (cancelled) return;

        setSvg(markup);

        const blob = new Blob([markup], {
          type: "image/svg+xml",
        });

        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch (e) {
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [text, size, margin, ecc]);

  return {
    svg,
    src,
    loading,
    error,
  };
}