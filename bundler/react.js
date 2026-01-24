import { useEffect, useState } from "react";
import {
  qr_png_data_url,
  qr_png_bytes,
  qr_decode_from_image,
} from "../index.bundler.js";

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
      .then((res) => alive && setSrc(res))
      .catch(() => alive && setSrc(""));

    return () => {
      alive = false;
    };
  }, [text, size, margin, ecc]);

  return src;
}

/**
 * Faster than base64 data url: uses Blob URL + revokes on cleanup
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
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = URL.createObjectURL(
          new Blob([bytes], { type: "image/png" }),
        );
        setSrc(objectUrl);
      })
      .catch(() => alive && setSrc(""));

    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [text, size, margin, ecc]);

  return src;
}

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
