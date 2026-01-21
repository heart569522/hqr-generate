# hqr-generate

Stable black/white QR Code generator returning PNG data URL (Rust + WASM).

## Install

npm i hqr-generate

## Usage (React / Next.js)

```ts
import { qr_png_data_url } from "hqr-generate";

const src = await qr_png_data_url("hello", 320, 4, "Q");
// <img src={src} />
```
