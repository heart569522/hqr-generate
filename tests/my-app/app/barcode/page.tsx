"use client";

// Barcodes through the React hooks, in Next.js.
import { useState } from "react";
import { useBarcode, useBarcodeSvg } from "barqrcode/react";
import Link from "next/link";

const FORMATS = [
  ["code128", "HELLO-123"],
  ["code39", "HELLO 123"],
  ["code93", "HELLO123"],
  ["codabar", "A12345B"],
  ["ean13", "012345678901"],
  ["ean8", "1234567"],
  ["itf", "12345678"],
] as const;

function Row({ format, data }: { format: string; data: string }) {
  const png = useBarcode(data, { format: format as never, height: 60 });
  const svg = useBarcodeSvg(data, { format: format as never, height: 60 });

  return (
    <div className="flex items-center gap-6 border-b border-black/10 py-3">
      <code className="w-36 shrink-0">{format}</code>
      <span className="w-32 shrink-0 opacity-60">{data}</span>
      {png.error ? (
        <span className="text-red-600">{String((png.error as Error).message)}</span>
      ) : (
        <>
          {png.src && <img src={png.src} alt={`${format} barcode`} className="h-16" />}
          {svg.svg && <div className="h-16" dangerouslySetInnerHTML={{ __html: svg.svg }} />}
        </>
      )}
    </div>
  );
}

export default function BarcodePage() {
  const [sku, setSku] = useState("SKU-0001");
  const live = useBarcodeSvg(sku, { format: "code128", text: true });

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8 font-mono text-sm">
      <header className="flex items-baseline gap-4">
        <h1 className="text-xl font-semibold">Barcodes</h1>
        <Link href="/" className="underline">
          ← back
        </Link>
      </header>

      <section>
        <label className="mb-2 block opacity-60">live (Code 128, digits shown)</label>
        <input
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          className="mb-3 w-full rounded border px-3 py-2"
        />
        {live.error ? (
          <p className="text-red-600" data-testid="live-error">
            {(live.error as { code?: string }).code} — {(live.error as Error).message}
          </p>
        ) : (
          live.svg && <div data-testid="live" dangerouslySetInnerHTML={{ __html: live.svg }} />
        )}
      </section>

      <section>
        {FORMATS.map(([format, data]) => (
          <Row key={format} format={format} data={data} />
        ))}
      </section>
    </main>
  );
}
