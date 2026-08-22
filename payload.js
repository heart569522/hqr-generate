// Typed payload builders.
//
// A QR code is just a string; the value is in getting that string *exactly*
// right, because a stray unescaped `;` in a Wi-Fi payload or a wrong checksum
// in a PromptPay payload fails silently — the code scans fine and then does
// nothing useful.
//
// Pure strings, no WASM, no dependency on the rest of the package: import from
// "@wirunrom/hqr-generate/payload" and feed the result to `generate*`.

function payloadError(message) {
  const err = new Error(message);
  err.code = "INVALID_PAYLOAD";
  return err;
}

function required(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw payloadError(`${name} is required and must be a non-empty string`);
  }
  return value;
}

/* =========================================================
 * Wi-Fi
 * ======================================================= */

// `\ ; , : "` are structural in the WIFI: format and must be backslash-escaped.
const escapeWifi = (value) => String(value).replace(/([\;,:"])/g, "\\$1");

/**
 * Wi-Fi join credentials, in the format Android and iOS camera apps understand.
 *
 * @param {{ ssid: string, password?: string, security?: 'WPA'|'WEP'|'nopass', hidden?: boolean }} opts
 * @returns {string}
 */
export function wifi({ ssid, password, security, hidden = false } = {}) {
  required(ssid, "ssid");

  const type = security ?? (password ? "WPA" : "nopass");
  if (!["WPA", "WEP", "nopass"].includes(type)) {
    throw payloadError(`security must be WPA, WEP or nopass — received ${JSON.stringify(security)}`);
  }
  if (type !== "nopass" && !password) {
    throw payloadError(`security ${type} needs a password`);
  }

  let out = `WIFI:T:${type};S:${escapeWifi(ssid)};`;
  if (type !== "nopass") out += `P:${escapeWifi(password)};`;
  if (hidden) out += "H:true;";
  return `${out};`;
}

/* =========================================================
 * Contacts
 * ======================================================= */

const escapeMecard = (value) => String(value).replace(/([\;:,])/g, "\\$1");

/**
 * MECARD contact — shorter than vCard, and what most scanners expect from a QR.
 *
 * @param {{ firstName?: string, lastName?: string, phone?: string, email?: string, url?: string, address?: string, note?: string, org?: string }} opts
 * @returns {string}
 */
export function mecard({ firstName, lastName, phone, email, url, address, note, org } = {}) {
  const name = [lastName, firstName].filter(Boolean).map(escapeMecard).join(",");
  if (!name) throw payloadError("mecard needs a firstName or lastName");

  const fields = [["N", name]];
  if (org) fields.push(["ORG", escapeMecard(org)]);
  if (phone) fields.push(["TEL", escapeMecard(phone)]);
  if (email) fields.push(["EMAIL", escapeMecard(email)]);
  if (url) fields.push(["URL", escapeMecard(url)]);
  if (address) fields.push(["ADR", escapeMecard(address)]);
  if (note) fields.push(["NOTE", escapeMecard(note)]);

  return `MECARD:${fields.map(([k, v]) => `${k}:${v};`).join("")};`;
}

// vCard folds on CRLF and escapes `\ ; ,` — newlines become a literal \n.
const escapeVcard = (value) =>
  String(value).replace(/([\;,])/g, "\\$1").replace(/\r?\n/g, "\\n");

/**
 * vCard 3.0 contact. Longer than {@link mecard} — check that the result still
 * fits at your error-correction level.
 *
 * @param {{ firstName?: string, lastName?: string, phone?: string, email?: string, url?: string, org?: string, title?: string, address?: string, note?: string }} opts
 * @returns {string}
 */
export function vcard({
  firstName = "",
  lastName = "",
  phone,
  email,
  url,
  org,
  title,
  address,
  note,
} = {}) {
  if (!firstName && !lastName) throw payloadError("vcard needs a firstName or lastName");

  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${escapeVcard(lastName)};${escapeVcard(firstName)};;;`,
    `FN:${escapeVcard([firstName, lastName].filter(Boolean).join(" "))}`,
  ];
  if (org) lines.push(`ORG:${escapeVcard(org)}`);
  if (title) lines.push(`TITLE:${escapeVcard(title)}`);
  if (phone) lines.push(`TEL;TYPE=CELL:${escapeVcard(phone)}`);
  if (email) lines.push(`EMAIL:${escapeVcard(email)}`);
  if (url) lines.push(`URL:${escapeVcard(url)}`);
  if (address) lines.push(`ADR:;;${escapeVcard(address)};;;;`);
  if (note) lines.push(`NOTE:${escapeVcard(note)}`);
  lines.push("END:VCARD");

  return lines.join("\r\n");
}

/* =========================================================
 * Actions
 * ======================================================= */

/** `mailto:` link with optional subject and body. */
export function mailto({ to, subject, body } = {}) {
  required(to, "to");
  const query = new URLSearchParams();
  if (subject) query.set("subject", subject);
  if (body) query.set("body", body);
  const qs = query.toString();
  return `mailto:${to}${qs ? `?${qs}` : ""}`;
}

/** `SMSTO:` — the form scanners recognize as "send this SMS". */
export function sms({ to, message } = {}) {
  required(to, "to");
  return `SMSTO:${to}${message ? `:${message}` : ""}`;
}

/** `tel:` dial link. */
export function tel(number) {
  required(number, "number");
  return `tel:${number}`;
}

/** `geo:` coordinates. */
export function geo({ latitude, longitude, altitude } = {}) {
  for (const [name, value] of [["latitude", latitude], ["longitude", longitude]]) {
    if (!Number.isFinite(value)) throw payloadError(`${name} must be a finite number`);
  }
  if (latitude < -90 || latitude > 90) throw payloadError("latitude must be between -90 and 90");
  if (longitude < -180 || longitude > 180) {
    throw payloadError("longitude must be between -180 and 180");
  }
  return `geo:${latitude},${longitude}${Number.isFinite(altitude) ? `,${altitude}` : ""}`;
}

/**
 * `otpauth://` URI for authenticator apps.
 *
 * @param {{ secret: string, account: string, issuer?: string, type?: 'totp'|'hotp', digits?: number, period?: number, algorithm?: 'SHA1'|'SHA256'|'SHA512', counter?: number }} opts
 */
export function otpauth({
  secret,
  account,
  issuer,
  type = "totp",
  digits,
  period,
  algorithm,
  counter,
} = {}) {
  required(secret, "secret");
  required(account, "account");
  if (type !== "totp" && type !== "hotp") {
    throw payloadError(`type must be totp or hotp — received ${JSON.stringify(type)}`);
  }
  if (type === "hotp" && !Number.isFinite(counter)) {
    throw payloadError("hotp needs a numeric counter");
  }

  const label = issuer ? `${issuer}:${account}` : account;
  const query = new URLSearchParams({ secret });
  if (issuer) query.set("issuer", issuer);
  if (algorithm) query.set("algorithm", algorithm);
  if (digits) query.set("digits", String(digits));
  if (type === "totp" && period) query.set("period", String(period));
  if (type === "hotp") query.set("counter", String(counter));

  return `otpauth://${type}/${encodeURIComponent(label)}?${query.toString()}`;
}

/* =========================================================
 * PromptPay (EMVCo merchant-presented QR)
 * ======================================================= */

/** EMVCo tag-length-value. Lengths are two decimal digits, so values cap at 99. */
function tlv(id, value) {
  const str = String(value);
  if (str.length > 99) {
    throw payloadError(`EMV field ${id} is ${str.length} characters, the format allows 99`);
  }
  return id + String(str.length).padStart(2, "0") + str;
}

/**
 * CRC-16/CCITT-FALSE: polynomial 0x1021, initial value 0xFFFF, no reflection,
 * no final XOR. This is the checksum EMVCo specifies for tag 63.
 */
export function crc16ccitt(input) {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

const PROMPTPAY_AID = "A000000677010111";

/** Work out which of the three PromptPay account forms `target` is. */
function promptpayAccount(target, type) {
  const digits = String(target ?? "").replace(/\D/g, "");
  if (!digits) throw payloadError("promptpay target is required");

  const asMobile = () => {
    // The wire format is 13 digits: 0066 + the 9-digit subscriber number.
    let subscriber;
    if (digits.length === 13 && digits.startsWith("0066")) subscriber = digits.slice(4);
    else if (digits.length === 11 && digits.startsWith("66")) subscriber = digits.slice(2);
    else if (digits.length === 10 && digits.startsWith("0")) subscriber = digits.slice(1);
    else if (digits.length === 9) subscriber = digits;
    else {
      throw payloadError(
        `promptpay mobile number must be 9 or 10 digits (or 66-prefixed) — received ${digits.length} digits`,
      );
    }
    return { tag: "01", value: `0066${subscriber}` };
  };

  const asNationalId = () => {
    if (digits.length !== 13) {
      throw payloadError(
        `promptpay national/tax ID must be 13 digits — received ${digits.length}`,
      );
    }
    return { tag: "02", value: digits };
  };

  const asEwallet = () => {
    if (digits.length !== 15) {
      throw payloadError(`promptpay e-wallet ID must be 15 digits — received ${digits.length}`);
    }
    return { tag: "03", value: digits };
  };

  switch (type) {
    case "mobile":
      return asMobile();
    case "nationalId":
      return asNationalId();
    case "ewallet":
      return asEwallet();
    case undefined:
      break;
    default:
      throw payloadError(`type must be mobile, nationalId or ewallet — received ${type}`);
  }

  // Auto-detect. A 13-digit value is ambiguous on its face, but a national ID
  // never starts with 00, and a wire-format mobile always does.
  if (digits.length === 15) return asEwallet();
  if (digits.length === 13) return digits.startsWith("00") ? asMobile() : asNationalId();
  return asMobile();
}

function promptpayAmount(amount) {
  if (amount == null) return null;
  const value = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(value) || value < 0) {
    throw payloadError(`promptpay amount must be a non-negative number — received ${amount}`);
  }
  if (value > 9_999_999_999.99) throw payloadError("promptpay amount is too large");
  return value.toFixed(2);
}

/**
 * Thai PromptPay payload (EMVCo merchant-presented QR, currency THB).
 *
 * `target` may be a mobile number, a 13-digit national/tax ID, or a 15-digit
 * e-wallet ID; pass `type` to remove the ambiguity between the last two. Adding
 * an `amount` switches the point-of-initiation tag from static (`11`) to
 * dynamic (`12`), which is what banking apps use to decide whether the amount
 * is editable.
 *
 * @param {{ target: string, amount?: number, type?: 'mobile'|'nationalId'|'ewallet' }} opts
 * @returns {string}
 */
export function promptpay({ target, amount, type } = {}) {
  const account = promptpayAccount(target, type);
  const formattedAmount = promptpayAmount(amount);

  const body =
    tlv("00", "01") +
    tlv("01", formattedAmount == null ? "11" : "12") +
    tlv("29", tlv("00", PROMPTPAY_AID) + tlv(account.tag, account.value)) +
    tlv("53", "764") +
    (formattedAmount == null ? "" : tlv("54", formattedAmount)) +
    tlv("58", "TH");

  // The checksum covers everything including tag 63's own id and length.
  const withCrcHeader = `${body}6304`;
  return withCrcHeader + crc16ccitt(withCrcHeader).toString(16).toUpperCase().padStart(4, "0");
}
