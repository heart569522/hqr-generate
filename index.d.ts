export type QrEcc = "L" | "M" | "Q" | "H";

/**
 * Generate QR code PNG as Data URL (base64).
 */
export declare function qr_png_data_url(
  text: string,
  size?: number,
  margin?: number,
  ecc?: QrEcc
): Promise<string>;

/**
 * Generate QR code PNG as raw bytes (Uint8Array).
 * Recommended for best performance (Blob URL, upload, caching).
 */
export declare function qr_png_bytes(
  text: string,
  size?: number,
  margin?: number,
  ecc?: QrEcc
): Promise<Uint8Array>;
