"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createScanner } from "../scanner.js";

export interface ScanResult {
  text: string;
  version: number;
  eccLevel: number;
  corners: { x: number; y: number }[];
}

export interface UseQrScannerOptions {
  /** Start the camera. Set to false to release it without unmounting. */
  enabled?: boolean;
  /** Called for every code seen, after de-duplication. */
  onResult?: (result: ScanResult) => void;
  facingMode?: "environment" | "user";
  deviceId?: string;
  /** Minimum gap between decode attempts. Default 120 ms. */
  scanIntervalMs?: number;
  /** Longest edge of the buffer actually decoded. Default 640 px. */
  maxSide?: number;
  /** How long the same text is suppressed after a hit. Default 1500 ms. */
  dedupeMs?: number;
}

/**
 * Live QR scanning from the device camera.
 *
 * ```tsx
 * const { videoRef, result, error } = useScanner({ onResult: (r) => console.log(r.text) });
 * return <video ref={videoRef} playsInline muted />;
 * ```
 *
 * The camera is released on unmount and whenever `enabled` goes false.
 */
export function useScanner(opts: UseQrScannerOptions = {}) {
  const {
    enabled = true,
    onResult,
    facingMode = "environment",
    deviceId,
    scanIntervalMs,
    maxSide,
    dedupeMs,
  } = opts;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [running, setRunning] = useState(false);

  // Callbacks usually arrive as fresh closures every render. Holding the latest
  // one in a ref keeps the effect from tearing the camera down and asking for
  // it again on each parent render.
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    if (!enabled) return;

    const video = videoRef.current;
    if (!video) {
      setError(new Error("useScanner: attach videoRef to a <video> element"));
      return;
    }

    let cancelled = false;
    let scanner: { stop: () => void } | null = null;

    (async () => {
      try {
        const started = await createScanner({
          video,
          facingMode,
          deviceId,
          scanIntervalMs,
          maxSide,
          dedupeMs,
          onResult: (r: ScanResult) => {
            setResult(r);
            onResultRef.current?.(r);
          },
          onError: (e: unknown) => setError(e),
        });

        if (cancelled) {
          started.stop();
          return;
        }
        scanner = started;
        setError(null);
        setRunning(true);
      } catch (e) {
        if (!cancelled) {
          setError(e);
          setRunning(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      scanner?.stop();
      setRunning(false);
    };
  }, [enabled, facingMode, deviceId, scanIntervalMs, maxSide, dedupeMs]);

  const reset = useCallback(() => setResult(null), []);

  return { videoRef, result, error, running, reset };
}
