// Server component: the QR is rendered during SSR and arrives in the HTML.
// No client JS, no WASM in the browser, no layout shift.
import { decode, qrModules, qrPng, qrSvg } from "barqr";
import { promptpay } from "barqr/payload";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function SsrPage() {
  const url = "https://example.com/rendered-on-the-server";

  // All synchronous — this is the Node build.
  const svg = qrSvg(url, { size: 240 });
  const grid = qrModules(url, { size: 240 });
  const payload = promptpay({ target: "081-234-5678", amount: 199.5 });
  const ppSvg = qrSvg(payload, { size: 240, ecc: "M" });

  // Prove the decoder works server-side too (it loads lazily, on this call).
  const roundTrip = decode(qrPng(url));

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8 font-mono text-sm">
      <header className="flex items-baseline gap-4">
        <h1 className="text-xl font-semibold">Server-rendered</h1>
        <Link href="/" className="underline">
          ← back
        </Link>
      </header>

      <p className={roundTrip === url ? "text-green-700" : "text-red-600"}>
        {roundTrip === url ? "PASS" : "FAIL"} — decode() round trip on the server
      </p>
      <p className="opacity-60">
        modules: {grid.n}×{grid.n} (v{grid.version}), image {grid.size}px
      </p>

      <div className="flex flex-wrap gap-8">
        <figure>
          <figcaption className="mb-1 opacity-60">SVG in the HTML payload</figcaption>
          <div className="w-60" dangerouslySetInnerHTML={{ __html: svg }} />
        </figure>
        <figure>
          <figcaption className="mb-1 opacity-60">PromptPay ฿199.50</figcaption>
          <div className="w-60" dangerouslySetInnerHTML={{ __html: ppSvg }} />
          <figcaption className="mt-1 max-w-60 break-all text-xs opacity-50">{payload}</figcaption>
        </figure>
        <figure>
          <figcaption className="mb-1 opacity-60">via /api/qr</figcaption>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/api/qr?text=from-the-route-handler&size=240" width={240} height={240} alt="QR" />
        </figure>
      </div>
    </main>
  );
}
