"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createScanner } from "../scanner.js";
/**
 * Live QR scanning from the device camera.
 *
 * ```tsx
 * const { videoRef, result, error } = useQrScanner({ onResult: (r) => console.log(r.text) });
 * return <video ref={videoRef} playsInline muted />;
 * ```
 *
 * The camera is released on unmount and whenever `enabled` goes false.
 */
export function useQrScanner(opts = {}) {
    const { enabled = true, onResult, facingMode = "environment", deviceId, scanIntervalMs, maxSide, dedupeMs, } = opts;
    const videoRef = useRef(null);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [running, setRunning] = useState(false);
    // Callbacks usually arrive as fresh closures every render. Holding the latest
    // one in a ref keeps the effect from tearing the camera down and asking for
    // it again on each parent render.
    const onResultRef = useRef(onResult);
    onResultRef.current = onResult;
    useEffect(() => {
        if (!enabled)
            return;
        const video = videoRef.current;
        if (!video) {
            setError(new Error("useQrScanner: attach videoRef to a <video> element"));
            return;
        }
        let cancelled = false;
        let scanner = null;
        (async () => {
            try {
                const started = await createScanner({
                    video,
                    facingMode,
                    deviceId,
                    scanIntervalMs,
                    maxSide,
                    dedupeMs,
                    onResult: (r) => {
                        setResult(r);
                        onResultRef.current?.(r);
                    },
                    onError: (e) => setError(e),
                });
                if (cancelled) {
                    started.stop();
                    return;
                }
                scanner = started;
                setError(null);
                setRunning(true);
            }
            catch (e) {
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
