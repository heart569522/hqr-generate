export type QrEcc = "L" | "M" | "Q" | "H";

export interface UseQrPngOptions {
  size?: number;
  margin?: number;
  ecc?: QrEcc;
}

export declare function useQrPngDataUrl(
  text: string,
  opts?: UseQrPngOptions
): string;

export declare function useQrPngBlobUrl(
  text: string,
  opts?: UseQrPngOptions
): string;
