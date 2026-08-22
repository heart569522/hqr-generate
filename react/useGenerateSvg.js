"use client";
import { useEffect, useState } from "react";
import { generateSvg } from "../index.web.js";
export function useGenerateSvg(text, opts) {
    const [svg, setSvg] = useState(null);
    const [src, setSrc] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    // Primitive deps so inline `opts` objects don't re-trigger WASM every render.
    const size = opts?.size;
    const margin = opts?.margin;
    const ecc = opts?.ecc;
    const sizeMode = opts?.sizeMode;
    useEffect(() => {
        if (!text)
            return;
        let cancelled = false;
        let objectUrl = null;
        (async () => {
            try {
                setLoading(true);
                const markup = await generateSvg(text, { size, margin, ecc, sizeMode });
                if (cancelled)
                    return;
                setSvg(markup);
                const blob = new Blob([markup], {
                    type: "image/svg+xml",
                });
                objectUrl = URL.createObjectURL(blob);
                setSrc(objectUrl);
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
            if (objectUrl)
                URL.revokeObjectURL(objectUrl);
        };
    }, [text, size, margin, ecc, sizeMode]);
    return {
        svg,
        src,
        loading,
        error,
    };
}
