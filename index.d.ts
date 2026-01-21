export type QrEcc = "L" | "M" | "Q" | "H";

/** Generate QR Code PNG as data URL (black/white). */
export function qr_png_data_url(
  text: string,
  size?: number,
  margin?: number,
  ecc?: QrEcc
): Promise<string>;
