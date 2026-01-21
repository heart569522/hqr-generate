export type QrEcc = "L" | "M" | "Q" | "H";

export function qr_png_data_url(
  text: string,
  size?: number,
  margin?: number,
  ecc?: QrEcc
): Promise<string>;
