import { useEffect, useState } from "react";
import { qr_png_data_url } from "../index.bundler.js";

export function useQrCode(text, opts) {
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
