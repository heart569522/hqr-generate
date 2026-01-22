# @wirunrom/hqr-generate

A **stable black-and-white QR Code generator** that returns a **PNG Data URL**, powered by **Rust + WebAssembly (WASM)**.

This library is designed with a **scan-reliability-first** mindset and a **frontend-first API**, making it easy to use in modern web applications without additional configuration.

---

## Features

- High-contrast **black & white only** output (maximum scan compatibility)
- Optimized for both **old and new mobile devices**
- Deterministic and consistent QR output
- Lightweight and fast (Rust + WASM)
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

```ts
import { qr_png_data_url } from "@wirunrom/hqr-generate";

const src = await qr_png_data_url(
  "hello world",
  320, // image size (px)
  4, // quiet zone (margin)
  "Q", // error correction level: L | M | Q | H
);

// Example usage:
<img src={src} alt="QR Code" />
```

## React Helper (Optional)

```ts
import { useQrPng } from "@wirunrom/hqr-generate/react";

function QR() {
  const src = useQrPng("hello world");

  if (!src) return null;
  return <img src={src} alt="QR Code" />;
}
```

## API Reference

qr_png_data_url(text, size?, margin?, ecLevel?)
Generate a QR code and return a PNG Data URL.

| Name      | Type                       | Default  | Description                  |
| --------- | -------------------------- | -------- | ---------------------------- |
| `text`    | `string`                   | required | Text to encode               |
| `size`    | `number`                   | `320`    | Image size in pixels         |
| `margin`  | `number`                   | `4`      | Quiet zone (recommended ≥ 4) |
| `ecLevel` | `"L" \| "M" \| "Q" \| "H"` | `"Q"`    | Error correction level       |
