"use client";

import { useEffect, useState } from "react";
import { decodeAny } from "../index.web.js";

/**
 * Read a symbol of any supported symbology out of `input` — QR, DataMatrix,
 * Aztec, PDF417 and the 1D formats.
 *
 * Loads a decoder roughly twice the size of the one {@link useDecode} uses, so
 * reach for that when QR is all you need.
 *
 * Depends on `input` by identity on purpose: consecutive camera frames share
 * their dimensions and often most of their bytes, so any cheaper signature
 * would decode the first frame and then go quiet.
 */
export function useDecodeAny(input?: Uint8Array | ImageData) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!input) return;

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        const result = await decodeAny(input);
        if (!cancelled) {
          setText(result);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e);
          setText(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [input]);

  return { text, error, loading };
}
