/* =========================================================
 * barqrcode/payload
 *
 * Typed builders for the string formats QR scanners recognize.
 * Pure strings — no WASM, nothing else from the package is loaded.
 * ======================================================= */

export interface WifiOptions {
  ssid: string;
  password?: string;
  /** Defaults to `WPA` when a password is given, `nopass` otherwise. */
  security?: "WPA" | "WEP" | "nopass";
  hidden?: boolean;
}

/** Wi-Fi join credentials (`WIFI:...`). */
export function wifi(opts: WifiOptions): string;

export interface ContactOptions {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  url?: string;
  address?: string;
  note?: string;
  org?: string;
}

/** MECARD contact — the compact form most scanners expect. */
export function mecard(opts: ContactOptions): string;

/** vCard 3.0 contact. Longer than {@link mecard}; watch your capacity. */
export function vcard(opts: ContactOptions & { title?: string }): string;

/** `mailto:` link. */
export function mailto(opts: { to: string; subject?: string; body?: string }): string;

/** `SMSTO:` — recognized by scanners as "send this SMS". */
export function sms(opts: { to: string; message?: string }): string;

/** `tel:` dial link. */
export function tel(number: string): string;

/** `geo:` coordinates. */
export function geo(opts: { latitude: number; longitude: number; altitude?: number }): string;

export interface OtpauthOptions {
  secret: string;
  account: string;
  issuer?: string;
  type?: "totp" | "hotp";
  digits?: number;
  period?: number;
  algorithm?: "SHA1" | "SHA256" | "SHA512";
  /** Required for `hotp`. */
  counter?: number;
}

/** `otpauth://` URI for authenticator apps. */
export function otpauth(opts: OtpauthOptions): string;

export interface PromptPayOptions {
  /**
   * A Thai mobile number, a 13-digit national/tax ID, or a 15-digit e-wallet
   * ID. Formatting characters are ignored.
   */
  target: string;
  /** Amount in THB. Omit for a code the payer fills in themselves. */
  amount?: number;
  /** Disambiguates a 13-digit target. Auto-detected when omitted. */
  type?: "mobile" | "nationalId" | "ewallet";
}

/**
 * Thai PromptPay payload (EMVCo merchant-presented QR, THB).
 *
 * Passing an `amount` switches the point-of-initiation tag from static (`11`)
 * to dynamic (`12`), which is how banking apps decide whether the amount is
 * editable.
 */
export function promptpay(opts: PromptPayOptions): string;

/**
 * CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF, no reflection, no final XOR) —
 * the checksum EMVCo specifies for tag 63. Exported so you can verify or parse
 * payloads from elsewhere.
 */
export function crc16ccitt(input: string): number;
