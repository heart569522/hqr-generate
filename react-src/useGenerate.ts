"use client";

import { useEffect, useState } from "react";
import { generatePng } from "../index.web.js";
import type { GenerateOptions } from "../index";

export function useGenerate(text?: string, opts?: GenerateOptions) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  // Destructure so the effect only re-runs when actual values change.
  // Passing the opts object directly caused a WASM re-run every render when
  // callers inlined opts (e.g. `useGenerate(t, { size: 320 })`).
  const size = opts?.size;
  const margin = opts?.margin;
  const ecc = opts?.ecc;
  const sizeMode = opts?.sizeMode;

  useEffect(() => {
    if (!text) return;

    let cancelled = false;
    let objectUrl: string | null = null;

    (async () => {
      try {
        setLoading(true);

        const result = await generatePng(text, { size, margin, ecc, sizeMode });
        if (cancelled) return;

        setBytes(result);

        // Cast: Uint8Array is a valid BlobPart at runtime; TS's stricter
        // dom lib flags SharedArrayBuffer variance here.
        const blob = new Blob([result as BlobPart], { type: "image/png" });
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
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [text, size, margin, ecc, sizeMode]);

  return {
    src,
    bytes,
    error,
    loading,
  };
}
