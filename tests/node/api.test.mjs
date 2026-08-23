// Smoke tests against the real package entry, not the Rust crate.
//
// These exist because every shipped regression in 0.4/0.5 lived in this layer:
// the ecc string that never reached WASM, the missing quiet zone, the ESM/CJS
// resolution breakage. `cargo test` cannot see any of it.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import * as pkg from "../../index.node.js";
import {
  decode,
  decodeAll,
  qrMany,
  barcodeModules,
  barcodePng,
  barcodeSvg,
  qrModules,
  qrPng,
  qrSvg,
  ready,
} from "../../index.node.js";

/** Read width/height out of a PNG IHDR chunk. */
function pngSize(bytes) {
  assert.deepEqual([...bytes.slice(0, 4)], [0x89, 0x50, 0x4e, 0x47], "not a PNG");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

test("qrPng works with no options at all", () => {
  const bytes = qrPng("https://example.com");
  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.length > 0);
  assert.deepEqual(pngSize(bytes), { width: 320, height: 320 });
});

test("size is the exact pixel size of the output", () => {
  for (const size of [128, 200, 256, 320, 512, 1000]) {
    assert.deepEqual(
      pngSize(qrPng("https://example.com/exact", { size })),
      { width: size, height: size },
      `size ${size}`,
    );
  }
});

test("sizeMode 'fit' never exceeds the requested size", () => {
  for (const size of [128, 320, 999]) {
    const { width } = pngSize(qrPng("https://example.com/fit", { size, sizeMode: "fit" }));
    assert.ok(width <= size, `fit produced ${width} > ${size}`);
  }
});

test("ecc actually reaches WASM", () => {
  // The 0.4/0.5 bug: every level silently became Q. A higher level needs a
  // bigger symbol, so the module counts must differ.
  const text = "https://example.com/some/path?with=query&and=more";
  const l = qrModules(text, { ecc: "L" }).n;
  const h = qrModules(text, { ecc: "H" }).n;
  assert.ok(h > l, `expected H (${h}) to need more modules than L (${l})`);
});

test("ecc is case-insensitive but rejects nonsense", () => {
  assert.equal(qrModules("x", { ecc: "h" }).n, qrModules("x", { ecc: "H" }).n);
  assert.throws(() => qrPng("x", { ecc: "Z" }), (e) => e.code === "INVALID_OPTION");
  assert.throws(() => qrPng("x", { sizeMode: "stretch" }), (e) => e.code === "INVALID_OPTION");
});

test("margin eats into the symbol, it does not grow the image", () => {
  // Same requested pixel size: a wider quiet zone leaves fewer pixels per
  // module, and the symbol itself is unchanged.
  const tight = qrModules("hello", { size: 320, margin: 0 });
  const loose = qrModules("hello", { size: 320, margin: 8 });
  assert.equal(tight.n, loose.n);
  assert.equal(tight.size, loose.size);
  assert.ok(loose.scale < tight.scale, `${loose.scale} should be < ${tight.scale}`);
  assert.ok(loose.origin > tight.origin);
});

test("svg output is a single path at the requested size", () => {
  const svg = qrSvg("https://example.com", { size: 256 });
  assert.match(svg, /^<svg /);
  assert.match(svg, /width="256" height="256"/);
  assert.equal(svg.match(/<path/g).length, 1);
});

test("module grid is a plain object with no wasm handle to free", () => {
  const m = qrModules("https://example.com");
  assert.equal(typeof m, "object");
  assert.equal(m.free, undefined);
  assert.equal(m.dark.length, m.n * m.n);
  assert.equal(m.n, 17 + 4 * m.version);
  assert.ok(m.dark.some((v) => v === 1) && m.dark.some((v) => v === 0));
});

test("round trip: encode then decode", () => {
  for (const text of ["hello", "https://example.com/x?y=1", "สวัสดีครับ", "🎉 emoji"]) {
    assert.equal(decode(qrPng(text)), text);
  }
});

test("decode reads canvas-shaped ImageData too", () => {
  const m = qrModules("imagedata path");
  const px = m.size;
  const data = new Uint8ClampedArray(px * px * 4).fill(255);
  const { origin } = m;

  for (let y = 0; y < m.n; y++) {
    for (let x = 0; x < m.n; x++) {
      if (!m.dark[y * m.n + x]) continue;
      for (let dy = 0; dy < m.scale; dy++) {
        for (let dx = 0; dx < m.scale; dx++) {
          const i = ((origin + y * m.scale + dy) * px + origin + x * m.scale + dx) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
      }
    }
  }

  assert.equal(decode({ width: px, height: px, data }), "imagedata path");
});

test("oversized images are refused before anything is allocated", () => {
  // A caller can hand us any width/height it likes. 30000x30000 would be a
  // 900 MB luminance buffer; the cap has to bite before that is attempted.
  assert.throws(
    () => decode({ width: 30_000, height: 30_000, data: new Uint8ClampedArray(0) }),
    (e) => e.code === "IMAGE_TOO_LARGE",
  );

  // Lopsided canvases must not sneak under a pixels-only budget.
  assert.throws(
    () => decode({ width: 1, height: 1_000_000, data: new Uint8ClampedArray(0) }),
    (e) => e.code === "IMAGE_TOO_LARGE",
  );

  // ...and an ordinary image still works.
  assert.equal(decode(qrPng("still fine", { size: 400 })), "still fine");
});

test("errors carry a stable code", () => {
  assert.throws(() => qrPng(""), (e) => e.code === "EMPTY_TEXT");
  assert.throws(() => qrPng("x", { size: 0 }), (e) => e.code === "INVALID_SIZE");
  assert.throws(() => qrPng("x".repeat(8000)), (e) => e.code === "PAYLOAD_TOO_LONG");
  assert.throws(
    () => decode(new Uint8Array([1, 2, 3, 4])),
    (e) => e.code === "INVALID_IMAGE",
  );
});

test("the public surface is exactly what 1.0 promises", () => {
  // The 0.5 snake_case aliases are gone; nothing should have crept in either.
  assert.deepEqual(
    Object.keys(pkg).sort(),
    [
      "barcodeModules",
      "barcodePng",
      "barcodeSvg",
      "decode",
      "decodeAll",
      "qrMany",
      "qrModules",
      "qrPng",
      "qrSvg",
      "ready",
    ],
    "unexpected change to the exported surface",
  );
});

test("qrMany encodes a batch", () => {
  const texts = ["one", "two", "three"];
  const batch = qrMany(texts, { size: 160 });

  assert.equal(batch.length, texts.length);
  batch.forEach((bytes, i) => {
    assert.ok(bytes instanceof Uint8Array);
    assert.deepEqual(pngSize(bytes), { width: 160, height: 160 });
    assert.equal(decode(bytes), texts[i], "batch must keep its order");
  });

  // Same output as encoding one at a time.
  assert.deepEqual([...batch[0]], [...qrPng("one", { size: 160 })]);
});

test("qrMany reports which entry failed", () => {
  assert.throws(
    () => qrMany(["fine", "", "also fine"]),
    (e) => e.code === "EMPTY_TEXT" && e.index === 1,
  );
  assert.throws(() => qrMany("not an array"), TypeError);
});

test("logoSpace blanks the centre and the code still scans", () => {
  const text = "https://example.com/with-logo";
  for (const [ecc, logoSpace] of [["Q", 20], ["H", 25], ["H", 30]]) {
    const bytes = qrPng(text, { ecc, logoSpace, size: 400 });
    assert.equal(decode(bytes), text, `${logoSpace}% at ecc ${ecc}`);
  }

  const m = qrModules(text, { ecc: "H", logoSpace: 25, size: 400 });
  assert.ok(m.logo, "expected a reserved rect");
  assert.equal(m.logo.size, m.logo.modules * m.scale);
  // Everything inside the rect is blank.
  const start = (m.n - m.logo.modules) / 2;
  for (let y = start; y < start + m.logo.modules; y++) {
    for (let x = start; x < start + m.logo.modules; x++) {
      assert.equal(m.dark[y * m.n + x], 0, `module (${x}, ${y}) should be blank`);
    }
  }
});

test("logoSpace is refused when error correction cannot cover it", () => {
  assert.throws(
    () => qrPng("x", { ecc: "L", logoSpace: 30 }),
    (e) => e.code === "LOGO_SPACE_TOO_LARGE",
  );
  assert.equal(qrModules("x", { logoSpace: 0 }).logo, null);
});

test("svg embeds the logo over the reserved square", () => {
  const svg = qrSvg("https://example.com/logo", {
    ecc: "H",
    logoSpace: 25,
    size: 400,
    logo: "data:image/png;base64,AAAA",
  });
  const { logo } = qrModules("https://example.com/logo", {
    ecc: "H",
    logoSpace: 25,
    size: 400,
  });

  assert.ok(svg.includes("<image "), "expected an <image> element");
  assert.ok(svg.includes(`x="${logo.x}" y="${logo.y}" width="${logo.size}"`));
  assert.ok(svg.indexOf("<image") > svg.indexOf("<path"), "logo must paint over the modules");
});

test("a logo href without reserved space is a mistake, not a no-op", () => {
  assert.throws(
    () => qrSvg("x", { logo: "data:image/png;base64,AAAA" }),
    (e) => e.code === "INVALID_OPTION",
  );
});

test("decodeAll returns positions", () => {
  const text = "positioned";
  const results = decodeAll(qrPng(text, { size: 300 }));

  assert.equal(results.length, 1);
  assert.equal(results[0].text, text);
  assert.equal(results[0].corners.length, 4);
  for (const c of results[0].corners) {
    assert.ok(c.x >= 0 && c.x <= 300 && c.y >= 0 && c.y <= 300, `corner out of bounds: ${JSON.stringify(c)}`);
  }
  assert.ok(results[0].version >= 1 && results[0].version <= 40);
});

test("barcodes: every symbology encodes and lands on whole pixels", () => {
  const cases = [
    ["code128", "HELLO-123"],
    ["code39", "HELLO 123"],
    ["code39-checksum", "HELLO123"],
    ["code93", "HELLO123"],
    ["code11", "123-45"],
    ["codabar", "A12345B"],
    ["ean13", "012345678901"],
    ["ean8", "1234567"],
    ["itf", "12345678"],
  ];

  for (const [format, data] of cases) {
    const m = barcodeModules(data, { format, moduleWidth: 3, height: 60, quiet: 8 });
    assert.ok(m.bars.length > 0, `${format} produced no bars`);
    assert.equal(m.origin, 8 * 3, `${format} quiet zone`);
    assert.equal(m.width, (m.bars.length + 16) * 3, `${format} width`);

    const png = barcodePng(data, { format, moduleWidth: 3, height: 60, quiet: 8 });
    assert.deepEqual(pngSize(png), { width: m.width, height: 60 }, `${format} png size`);
  }
});

test("barcodes: EAN computes the check digit and prints it", () => {
  // 12 digits in, 13 out — the printed text has to match the bars.
  const m = barcodeModules("012345678901", { format: "ean13" });
  assert.equal(m.text, "0123456789012");
  assert.equal(m.bars.length, 95, "EAN-13 is 95 modules by definition");

  const svg = barcodeSvg("012345678901", { format: "ean13" });
  assert.ok(svg.includes("<text"), "EAN should print its digits");
  assert.ok(svg.includes("0123456789012"), "printed text must include the check digit");

  // Passing the full 13 digits keeps them.
  assert.equal(barcodeModules("0123456789012", { format: "ean13" }).text, "0123456789012");
});

test("barcodes: text is drawn only where the symbology expects it", () => {
  assert.ok(!barcodeSvg("ABC", { format: "code128" }).includes("<text"));
  assert.ok(barcodeSvg("ABC", { format: "code128", text: true }).includes("<text"));
  assert.ok(!barcodeSvg("1234567", { format: "ean8", text: false }).includes("<text"));
});

test("barcodes: data a symbology cannot represent is rejected", () => {
  // Code 39 has no lowercase.
  assert.throws(
    () => barcodePng("abc", { format: "code39" }),
    (e) => e.code === "INVALID_BARCODE_DATA",
  );
  // EAN-13 needs 12 or 13 digits.
  assert.throws(
    () => barcodePng("123", { format: "ean13" }),
    (e) => e.code === "INVALID_BARCODE_DATA",
  );
  assert.throws(
    () => barcodePng("HELLO", { format: "nope" }),
    (e) => e.code === "INVALID_OPTION",
  );
});

test("ready() resolves", async () => {
  await ready();
  await ready({ decoder: true });
});
