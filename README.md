# @wirunrom/hqr-generate

A **stable black-and-white QR Code generator** that returns a **PNG Data URL**, powered by **Rust + WebAssembly (WASM)**.

- High contrast (black & white) for maximum scan reliability
- Designed to work across old and new mobile devices
- Simple API for frontend usage
- Compatible with React, Next.js, and modern bundlers

---

## Installation

```bash
npm install @wirunrom/hqr-generate
```

## Usage (React / Next.js)

```ts
import { qr_png_data_url } from "@wirunrom/hqr-generate";

const src = await qr_png_data_url(
  "hello world",
  320, // image size (px)
  4, // margin (quiet zone)
  "Q", // error correction level: L | M | Q | H
);

// Example:
// <img src={src} alt="QR Code" />
```
