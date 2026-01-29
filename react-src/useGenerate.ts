"use client";

import { useEffect, useState } from "react";
import { generate } from "../index.web.js";
import type { GenerateOptions } from "../index";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.buffer instanceof ArrayBuffer) {
    return bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
  }

  return Uint8Array.from(bytes).buffer;
}

export function useGenerate(text?: string, opts?: GenerateOptions) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!text) return;

    let cancelled = false;
    let objectUrl: string | null = null;

    (async () => {
      try {
        setLoading(true);

        const result = await generate(text, opts);
        if (cancelled) return;

        setBytes(result);

        const buffer = toArrayBuffer(result);
        const blob = new Blob([buffer], { type: "image/png" });
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
  }, [text, opts]);

  return {
    src,
    bytes,
    error,
    loading,
  };
}
