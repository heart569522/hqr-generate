"use client";

// Client-side surface check. Everything imports through the package name, so
// this exercises the real `exports` map — the part a relative import would
// silently skip, and the part that broke in 0.4.2 and again in 0.5.
import { useEffect, useState } from "react";
import {
  decode,
  decodeAll,
  generateMany,
  generateModules,
  generatePng,
  generateSvg,
  ready,
} from "barqr";
import { promptpay, wifi } from "barqr/payload";
import { useGenerate, useGenerateModules, useGenerateSvg } from "barqr/react";
import Link from "next/link";

const URL_PAYLOAD = "https://example.com/products/12345?utm_source=qr";

type Check = { name: string; ok: boolean; detail: string };

function pngSize(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

export default function Home() {
  const [checks, setChecks] = useState<Check[] | null>(null);

  // Hooks under test, with inline opts objects on purpose: if the dependency
  // tracking regresses, these re-run WASM on every render.
  const png = useGenerate(URL_PAYLOAD, { size: 240 });
  const svg = useGenerateSvg(URL_PAYLOAD, { size: 240 });
  const grid = useGenerateModules(URL_PAYLOAD, { size: 240, ecc: "H", logoSpace: 24 });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const results: Check[] = [];
      const run = async (name: string, fn: () => Promise<string>) => {
        try {
          results.push({ name, ok: true, detail: await fn() });
        } catch (e) {
          results.push({ name, ok: false, detail: String((e as Error)?.message ?? e) });
        }
      };

      await run("ready()", async () => {
        await ready();
        return "wasm loaded";
      });

      await run("size is exact", async () => {
        const { width, height } = pngSize(await generatePng(URL_PAYLOAD, { size: 320 }));
        if (width !== 320 || height !== 320) throw new Error(`got ${width}x${height}`);
        return "320 x 320";
      });

      await run("round trip", async () => {
        const text = await decode(await generatePng(URL_PAYLOAD));
        if (text !== URL_PAYLOAD) throw new Error(`decoded ${text}`);
        return "decode matched";
      });

      await run("decodeAll positions", async () => {
        const [first] = await decodeAll(await generatePng("positioned", { size: 300 }));
        return `v${first.version}, ${first.corners.length} corners`;
      });

      await run("generateMany", async () => {
        const batch = await generateMany(["a", "b", "c"], { size: 120 });
        return `${batch.length} codes, ${batch[0].length} bytes each`;
      });

      await run("logo hole still decodes", async () => {
        const bytes = await generatePng(URL_PAYLOAD, { ecc: "H", logoSpace: 24, size: 400 });
        if ((await decode(bytes)) !== URL_PAYLOAD) throw new Error("decode failed");
        const m = await generateModules(URL_PAYLOAD, { ecc: "H", logoSpace: 24, size: 400 });
        return `${m.logo?.modules} modules reserved`;
      });

      await run("payload builders", async () => {
        const pp = promptpay({ target: "081-234-5678", amount: 250 });
        if ((await decode(await generatePng(pp, { ecc: "M" }))) !== pp) {
          throw new Error("promptpay round trip failed");
        }
        wifi({ ssid: "Cafe; Free", password: "hunter2" });
        return pp.slice(0, 28) + "…";
      });

      await run("typed errors", async () => {
        try {
          await generatePng("x", { ecc: "L", logoSpace: 30 });
        } catch (e) {
          const code = (e as { code?: string }).code;
          if (code !== "LOGO_SPACE_TOO_LARGE") throw new Error(`got ${code}`);
          return code;
        }
        throw new Error("expected a throw");
      });

      if (!cancelled) setChecks(results);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const failed = checks?.filter((c) => !c.ok).length ?? 0;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-8 font-mono text-sm">
      <header className="flex flex-wrap items-baseline gap-4">
        <h1 className="text-xl font-semibold">barqr — Next.js client checks</h1>
        <nav className="flex gap-3 underline">
          <Link href="/ssr">/ssr</Link>
          <Link href="/api/qr?text=hello">/api/qr</Link>
          <Link href="/scan">/scan</Link>
          <Link href="/barcode">/barcode</Link>
        </nav>
      </header>

      <section>
        <h2 className={checks && failed ? "text-red-600" : "text-green-700"}>
          {checks ? `${checks.length - failed}/${checks.length} passed` : "running…"}
        </h2>
        <ol className="mt-2 space-y-1">
          {checks?.map((c) => (
            <li key={c.name} className={c.ok ? "text-green-700" : "text-red-600"}>
              {c.ok ? "PASS" : "FAIL"} — {c.name}
              <span className="opacity-60"> · {c.detail}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-wrap items-start gap-6">
        <figure>
          <figcaption className="mb-1 opacity-60">useGenerate</figcaption>
          {png.src && <img src={png.src} width={240} height={240} alt="QR from useGenerate" />}
        </figure>

        <figure>
          <figcaption className="mb-1 opacity-60">useGenerateSvg</figcaption>
          {svg.svg && (
            <div className="w-60" dangerouslySetInnerHTML={{ __html: svg.svg }} />
          )}
        </figure>

        <figure>
          <figcaption className="mb-1 opacity-60">useGenerateModules → inline SVG</figcaption>
          {grid.modules && <InlineQr modules={grid.modules} />}
        </figure>
      </section>
    </main>
  );
}

/** Render the raw grid as a real DOM <svg>, with the logo hole filled in. */
function InlineQr({
  modules,
}: {
  modules: NonNullable<ReturnType<typeof useGenerateModules>["modules"]>;
}) {
  const { n, scale, size, origin, dark, logo } = modules;
  const rects = [];

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (dark[y * n + x]) {
        rects.push(
          <rect
            key={`${x}-${y}`}
            x={origin + x * scale}
            y={origin + y * scale}
            width={scale}
            height={scale}
          />,
        );
      }
    }
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="w-60">
      <rect width="100%" height="100%" fill="white" />
      <g fill="currentColor">{rects}</g>
      {logo && (
        <circle cx={logo.x + logo.size / 2} cy={logo.y + logo.size / 2} r={logo.size / 2} fill="#c0261a" />
      )}
    </svg>
  );
}
