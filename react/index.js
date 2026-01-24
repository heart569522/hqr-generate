import { useEffect, useState } from "react";
import {
  qr_png_data_url,
  qr_png_bytes,
  qr_decode_from_image,
} from "../index.web.js";

/**
 * React hook for QR Code Data URL (browser-only).
 * Backward-compatible, but heavier than Blob URL due to base64.
 * @param {string} text
 * @param {{size?:number, margin?:number, ecc?:"L"|"M"|"Q"|"H"}} [opts]
 */
export function useQrPngDataUrl(text, opts) {
  const size = opts?.size ?? 320;
  const margin = opts?.margin ?? 4;
  const ecc = opts?.ecc ?? "Q";

  const [src, setSrc] = useState("");

  useEffect(() => {
    let alive = true;

    if (!text) {
      setSrc("");
      return () => {
        alive = false;
      };
    }

    qr_png_data_url(text, size, margin, ecc)
      .then((res) => {
        if (alive) setSrc(res);
      })
      .catch(() => {
        if (alive) setSrc("");
      });

    return () => {
      alive = false;
    };
  }, [text, size, margin, ecc]);

  return src;
}

/**
 * React hook for QR Code as Blob URL (browser-only).
 * Faster + lower memory than base64 data URL for frequent updates / large images.
 * @param {string} text
 * @param {{size?:number, margin?:number, ecc?:"L"|"M"|"Q"|"H"}} [opts]
 */
export function useQrPngBlobUrl(text, opts) {
  const size = opts?.size ?? 320;
  const margin = opts?.margin ?? 4;
  const ecc = opts?.ecc ?? "Q";

  const [src, setSrc] = useState("");

  useEffect(() => {
    let alive = true;
    let objectUrl = "";

    if (!text) {
      setSrc("");
      return () => {
        alive = false;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    }

    qr_png_bytes(text, size, margin, ecc)
      .then((bytes) => {
        if (!alive) return;

        // revoke old url (if any)
        if (objectUrl) URL.revokeObjectURL(objectUrl);

        objectUrl = URL.createObjectURL(
          new Blob([bytes], { type: "image/png" }),
        );
        setSrc(objectUrl);
      })
      .catch(() => {
        if (alive) setSrc("");
      });

    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [text, size, margin, ecc]);

  return src;
}

/**
 * React hook for decoding QR code from ImageData.
 *
 * @param {ImageData | null} image
 * @returns {{ text: string | null, error: unknown | null, loading: boolean }}
 */
export function useQrDecodeFromImage(image) {
  const [text, setText] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;

    if (!image) {
      setText(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    qr_decode_from_image(image)
      .then((res) => {
        if (!alive) return;
        setText(res);
        setLoading(false);
      })
      .catch((err) => {
        if (!alive) return;
        setText(null);
        setError(err);
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [image]);

  return { text, error, loading };
}
