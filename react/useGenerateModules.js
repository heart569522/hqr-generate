"use client";
import { useEffect, useState } from "react";
import { generateModules } from "../index.web.js";
/**
 * The QR module grid, for rendering the code yourself — an inline `<svg>` that
 * inherits `currentColor`, a `<canvas>`, a PDF, a print layout.
 *
 * Unlike {@link useGenerate}, nothing here allocates a Blob or an object URL,
 * so there is no URL lifetime to manage and the markup is server-renderable
 * once you have the grid.
 */
export function useGenerateModules(text, opts) {
    const [modules, setModules] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    // Primitive deps: an inline `opts` object would otherwise re-run WASM on
    // every render. Add any new option here *and* in the destructure above.
    const size = opts?.size;
    const margin = opts?.margin;
    const ecc = opts?.ecc;
    const sizeMode = opts?.sizeMode;
    useEffect(() => {
        if (!text)
            return;
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                const result = await generateModules(text, { size, margin, ecc, sizeMode });
                if (!cancelled) {
                    setModules(result);
                    setError(null);
                }
            }
            catch (e) {
                if (!cancelled)
                    setError(e);
            }
            finally {
                if (!cancelled)
                    setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [text, size, margin, ecc, sizeMode]);
    return { modules, error, loading };
}
