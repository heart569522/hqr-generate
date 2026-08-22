// Payload builders are pure string formatting, which is exactly why they need
// tests: a wrong checksum or an unescaped separator produces a QR code that
// scans perfectly and then does nothing.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  crc16ccitt,
  geo,
  mailto,
  mecard,
  otpauth,
  promptpay,
  sms,
  tel,
  vcard,
  wifi,
} from "../../payload.js";
import { decode, generatePng } from "../../index.node.js";

/** Minimal EMVCo tag-length-value reader, so assertions describe structure. */
function parseTlv(payload) {
  const out = {};
  let i = 0;
  while (i < payload.length) {
    const id = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    assert.ok(Number.isInteger(len), `bad length at offset ${i}`);
    out[id] = payload.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  return out;
}

test("crc16ccitt matches the standard test vector", () => {
  // The canonical check value for CRC-16/CCITT-FALSE.
  assert.equal(crc16ccitt("123456789"), 0x29b1);
});

test("promptpay: mobile number in every accepted spelling", () => {
  const expected = promptpay({ target: "0812345678" });
  for (const spelling of ["081-234-5678", "+66812345678", "66812345678", "812345678"]) {
    assert.equal(promptpay({ target: spelling }), expected, spelling);
  }

  const tags = parseTlv(expected);
  assert.equal(tags["00"], "01", "payload format indicator");
  assert.equal(tags["01"], "11", "static, since no amount was given");
  assert.equal(tags["53"], "764", "THB");
  assert.equal(tags["58"], "TH");

  const merchant = parseTlv(tags["29"]);
  assert.equal(merchant["00"], "A000000677010111", "PromptPay AID");
  assert.equal(merchant["01"], "0066812345678", "mobile in 0066 + 9-digit form");
});

test("promptpay: an amount switches the code to dynamic", () => {
  const tags = parseTlv(promptpay({ target: "0812345678", amount: 1234.5 }));
  assert.equal(tags["01"], "12", "dynamic point of initiation");
  assert.equal(tags["54"], "1234.50", "two decimal places");
});

test("promptpay: national ID and e-wallet use their own tags", () => {
  const natId = parseTlv(promptpay({ target: "1234567890123" }));
  assert.equal(parseTlv(natId["29"])["02"], "1234567890123");

  const wallet = parseTlv(promptpay({ target: "123456789012345" }));
  assert.equal(parseTlv(wallet["29"])["03"], "123456789012345");

  // A 13-digit value starting 00 is a wire-format mobile, not an ID.
  const mobile = parseTlv(promptpay({ target: "0066812345678" }));
  assert.equal(parseTlv(mobile["29"])["01"], "0066812345678");

  // ...and `type` overrides the guess.
  const forced = parseTlv(promptpay({ target: "1234567890123", type: "nationalId" }));
  assert.equal(parseTlv(forced["29"])["02"], "1234567890123");
});

test("promptpay: the checksum covers the 6304 header itself", () => {
  const payload = promptpay({ target: "0812345678", amount: 99 });
  const body = payload.slice(0, -4);
  const checksum = payload.slice(-4);

  assert.ok(body.endsWith("6304"), "tag 63 header must be inside the checksummed range");
  assert.equal(checksum, crc16ccitt(body).toString(16).toUpperCase().padStart(4, "0"));
  assert.match(checksum, /^[0-9A-F]{4}$/);
});

test("promptpay: bad input is rejected, not silently mangled", () => {
  const bad = [
    [{ target: "" }, "empty"],
    [{ target: "12345" }, "too short"],
    [{ target: "1234567890123", type: "ewallet" }, "wrong length for the declared type"],
    [{ target: "0812345678", amount: -5 }, "negative amount"],
    [{ target: "0812345678", amount: Number.NaN }, "NaN amount"],
  ];
  for (const [opts, why] of bad) {
    assert.throws(() => promptpay(opts), (e) => e.code === "INVALID_PAYLOAD", why);
  }
});

test("promptpay survives a real encode/decode round trip", () => {
  const payload = promptpay({ target: "0812345678", amount: 250 });
  assert.equal(decode(generatePng(payload, { ecc: "M" })), payload);
});

test("wifi escapes the separators that would split the payload", () => {
  const payload = wifi({ ssid: "Cafe; Free", password: 'p:a"ss,1' });
  // Every structural character inside a value is backslash-escaped, so a
  // scanner splitting on `;` and `:` still sees the right fields.
  assert.equal(payload, 'WIFI:T:WPA;S:Cafe\\; Free;P:p\\:a\\"ss\\,1;;');

  assert.equal(wifi({ ssid: "Open" }), "WIFI:T:nopass;S:Open;;");
  assert.match(wifi({ ssid: "H", password: "x", hidden: true }), /H:true;;$/);
  assert.throws(() => wifi({ ssid: "x", security: "WPA" }), (e) => e.code === "INVALID_PAYLOAD");
  assert.throws(() => wifi({}), (e) => e.code === "INVALID_PAYLOAD");
});

test("contacts", () => {
  assert.equal(
    mecard({ firstName: "Somchai", lastName: "Jaidee", phone: "+66812345678" }),
    "MECARD:N:Jaidee,Somchai;TEL:+66812345678;;",
  );
  assert.throws(() => mecard({ phone: "1" }), (e) => e.code === "INVALID_PAYLOAD");

  const card = vcard({ firstName: "Somchai", lastName: "Jaidee", email: "s@example.com" });
  assert.ok(card.startsWith("BEGIN:VCARD\r\nVERSION:3.0"));
  assert.ok(card.endsWith("END:VCARD"));
  assert.ok(card.includes("FN:Somchai Jaidee"));
});

test("action links", () => {
  assert.equal(mailto({ to: "a@b.com" }), "mailto:a@b.com");
  assert.equal(
    mailto({ to: "a@b.com", subject: "hi there" }),
    "mailto:a@b.com?subject=hi+there",
  );
  assert.equal(sms({ to: "+66812345678", message: "hello" }), "SMSTO:+66812345678:hello");
  assert.equal(tel("+66812345678"), "tel:+66812345678");
  assert.equal(geo({ latitude: 13.7563, longitude: 100.5018 }), "geo:13.7563,100.5018");
  assert.throws(() => geo({ latitude: 200, longitude: 0 }), (e) => e.code === "INVALID_PAYLOAD");
});

test("otpauth", () => {
  const uri = otpauth({ secret: "JBSWY3DPEHPK3PXP", account: "user@example.com", issuer: "Acme" });
  assert.ok(uri.startsWith("otpauth://totp/Acme%3Auser%40example.com?"));
  assert.ok(uri.includes("secret=JBSWY3DPEHPK3PXP"));
  assert.ok(uri.includes("issuer=Acme"));
  assert.throws(
    () => otpauth({ secret: "x", account: "y", type: "hotp" }),
    (e) => e.code === "INVALID_PAYLOAD",
    "hotp without a counter",
  );
});
