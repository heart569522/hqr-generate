import type { QrEcc } from "../index";

export interface UseQrPngOptions {
  size?: number;
  margin?: number;
  ecc?: QrEcc;
}

/**
 * React hook that returns PNG Data URL string (base64).
 */
export declare function useQrPngDataUrl(
  text: string,
  opts?: UseQrPngOptions
): string;

/**
 * React hook that returns Blob URL string.
 */
export declare function useQrPngBlobUrl(
  text: string,
  opts?: UseQrPngOptions
): string;

export declare function useQrDecodeFromImage(
  image: ImageData | null
): {
  text: string | null;
  error: unknown | null;
  loading: boolean;
};
