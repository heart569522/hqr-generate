# @wirunrom/hqr-generate

A high-performance **QR Code generator and decoder** with
**black-and-white only output**, powered by **Rust + WebAssembly (WASM)**.

Supports both **QR generation** and **QR decoding (scan)** in modern web applications.

This library is designed with a **scan-reliability-first** mindset and a **frontend-first API**, making it easy to use in modern web applications without additional configuration.

---

## Features

- High-contrast **black & white only** output (maximum scan compatibility)
- Optimized for both **old and new mobile devices**
- Deterministic and consistent QR output
- Lightweight and fast (**Rust + WASM**)
- QR decoding (scan) from browser ImageData
- Supports:
  - **PNG Data URL** (simple usage)
  - **PNG raw bytes** (best performance, no Base64 overhead)
- Works out of the box with:
  - Plain HTML / JavaScript
  - React
  - Next.js (Pages Router & App Router)
  - Modern bundlers (Vite, Webpack, etc.)

---

## Installation

```bash
npm install @wirunrom/hqr-generate
```

## Basic Usage (Bundler / React / Next.js)

**Generate PNG Data URL**

Simple and widely compatible. Recommended for most use cases.

```ts
import { qr_png_data_url } from "@wirunrom/hqr-generate";

const src = await qr_png_data_url("hello world", 320, 4, "Q");

<img src={src} alt="QR Code" />
```

**Generate PNG Bytes (Best Performance)**

Using raw bytes avoids Base64 overhead and is more memory-efficient.

```ts
import { qr_png_bytes } from "@wirunrom/hqr-generate";

const bytes = await qr_png_bytes("hello world", 320, 4, "Q");

const url = URL.createObjectURL(
  new Blob([bytes], { type: "image/png" })
);

<img src={url} alt="QR Code" />
```

**Decode QR Code**

Decode a QR code from browser ImageData (Canvas / camera / image upload friendly).

```ts
import { qr_decode_from_image } from "@wirunrom/hqr-generate";

const imageData = ctx.getImageData(0, 0, width, height);
const text = await qr_decode_from_image(imageData);

console.log(text);
```

Decode runs entirely in WASM and does not require server-side processing.

## React Hook Helper (/react)

For React or Next.js applications, the library provides idiomatic React hooks that manage async state automatically.

**useQrPngDataUrl**

Generates a PNG Data URL and updates automatically when inputs change.

```ts
import { useQrPngDataUrl } from "@wirunrom/hqr-generate/react";

function QR() {
  const src = useQrPngDataUrl("hello world", {
    size: 320,
    margin: 4,
    ecc: "Q",
  });

  if (!src) return null;
  return <img src={src} alt="QR Code" />;
}
```

**useQrPngBlobUrl**

Generates a Blob URL instead of a Base64 Data URL.
Recommended for larger QR codes or frequent updates.

```ts
import { useQrPngBlobUrl } from "@wirunrom/hqr-generate/react";

function QR() {
  const src = useQrPngBlobUrl("hello world", {
    size: 320,
    margin: 4,
    ecc: "Q",
  });

  if (!src) return null;
  return <img src={src} alt="QR Code" />;
}
```

**useQrDecodeFromImage**

Decode a QR code from browser ImageData.

```ts
import { useQrDecodeFromImage } from "@wirunrom/hqr-generate/react";

function Scanner({ image }: { image: ImageData | null }) {
  const { text, loading, error } = useQrDecodeFromImage(image);

  if (loading) return <div>Scanning…</div>;
  if (error) return <div>Error</div>;
  if (!text) return null;

  return <div>QR: {text}</div>;
}
```

## Plain HTML / No Bundler (/web)

Use this entry when working with static HTML, CDN, or environments without a bundler.

```html
<script type="module">
  import {
    qr_png_bytes,
    qr_png_data_url,
    qr_decode_from_image_data,
  } from "@wirunrom/hqr-generate/web";

  const src = await qr_png_data_url("hello world", 320, 4, "Q");
  document.getElementById("qr").src = src;

  // decode example (canvas)
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const text = await qr_decode_from_image_data(imageData);
  console.log(text);
</script>

<img id="qr" />
<canvas id="c" hidden></canvas>
```

## API Reference

**GenerateQR**

Generate a QR code and return a PNG Data URL.

Parameters

| Name   | Type                       | Default | Description                  |
| ------ | -------------------------- | ------- | ---------------------------- |
| text   | `string`                   | —       | Text to encode               |
| size   | `number`                   | `320`   | Image size in pixels         |
| margin | `number`                   | `4`     | Quiet zone (recommended ≥ 4) |
| ecc    | `"L" \| "M" \| "Q" \| "H"` | `"Q"`   | Error correction level       |

**DecodeQR**

Decode a QR code from browser ImageData.

This is the recommended decode API for web, camera, canvas, and image upload workflows.

Parameters

| Name  | Type        | Description                                 |
| ----- | ----------- | ------------------------------------------- |
| image | `ImageData` | RGBA image data from Canvas or Camera frame |

Returns

- `ts Promise<string>`
  - Resolves with decoded QR text
  - Rejects if no QR code is detected or image is invalid

Notes

- Input must be RGBA ImageData
- Decode runs entirely in WASM
- No server or backend required
- Best results with:
  - High-contrast QR codes
  - Minimal blur
  - Proper quiet zone
