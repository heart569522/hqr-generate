# @wirunrom/hqr-generate

A **stable black-and-white QR Code generator** that returns a **PNG Data URL or PNG bytes**, powered by **Rust + WebAssembly (WASM)**.

This library is designed with a **scan-reliability-first** mindset and a **frontend-first API**, making it easy to use in modern web applications without additional configuration.

---

## Features

- High-contrast **black & white only** output (maximum scan compatibility)
- Optimized for both **old and new mobile devices**
- Deterministic and consistent QR output
- Lightweight and fast (**Rust + WASM**)
- Supports both:
  - **PNG Data URL** (simple usage)
  - **PNG raw bytes** (best performance)
- Works out of the box with:
  - Plain HTML
  - React
  - Next.js (Pages Router & App Router)
  - Modern bundlers (Vite, Webpack, etc.)

---

## Installation

```bash
npm install @wirunrom/hqr-generate
```

## Basic Usage (Browser / React / Next.js)

Generate PNG Data URL (simple & compatible)

```ts
import { qr_png_data_url } from "@wirunrom/hqr-generate";

const src = await qr_png_data_url("hello", 320, 4, "Q");
<img src={src} alt="QR Code" />
```

Generate PNG Bytes
Using raw bytes avoids Base64 overhead and is more memory-efficient.

```ts
import { qr_png_bytes } from "@wirunrom/hqr-generate";

const bytes = await qr_png_bytes("hello", 320, 4, "Q");
const url = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));

<img src={url} alt="QR Code" />
```

## React Hook Helper

**useQrPngDataUrl**
A React hook that generates a PNG Data URL and updates automatically when inputs change.

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
A React hook that generates a Blob URL and updates automatically when inputs change.

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

## API Reference

**qr_png_data_url(text, size?, margin?, ecc?)**
Generate a QR code and return a PNG Data URL.

| Name   | Type                       | Default | Description                  |
| ------ | -------------------------- | ------- | ---------------------------- |
| text   | `string`                   | —       | Text to encode               |
| size   | `number`                   | `320`   | Image size in pixels         |
| margin | `number`                   | `4`     | Quiet zone (recommended ≥ 4) |
| ecc    | `"L" \| "M" \| "Q" \| "H"` | `"Q"`   | Error correction level       |

**qr_png_bytes(text, size?, margin?, ecc?)**
Generate a QR code and return PNG raw bytes (Uint8Array).
This is the fastest and most memory-efficient option.

| Name   | Type                       | Default | Description                  |
| ------ | -------------------------- | ------- | ---------------------------- |
| text   | `string`                   | —       | Text to encode               |
| size   | `number`                   | `320`   | Image size in pixels         |
| margin | `number`                   | `4`     | Quiet zone (recommended ≥ 4) |
| ecc    | `"L" \| "M" \| "Q" \| "H"` | `"Q"`   | Error correction level       |
