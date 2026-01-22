import type { QrEcc } from "../index";

export declare function useQrCode(
  text: string,
  opts?: { size?: number; margin?: number; ecc?: QrEcc }
): string;
