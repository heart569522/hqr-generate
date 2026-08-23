"use client";

// Camera scanning.
//
// A real camera needs a secure context: localhost is fine on a laptop, but
// testing on a phone means https (a tunnel, or `next dev --experimental-https`).
// "Simulated camera" needs neither, and drives the same code path through a
// canvas-backed MediaStream — use it when the machine has no camera.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useScanner } from "barqrcode/react";
import { promptpay } from "barqrcode/payload";
import { installFakeCamera, type FakeCamera } from "./fake-camera";

const SAMPLES = [
  "https://example.com/scanned",
  "สวัสดีครับ ทดสอบภาษาไทย",
  promptpay({ target: "081-234-5678", amount: 42 }),
];

type Mode = "off" | "real" | "fake";

export default function ScanPage() {
  const [mode, setMode] = useState<Mode>("off");
  const [ready, setReady] = useState(false);
  const [sample, setSample] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const fake = useRef<FakeCamera | null>(null);

  // The getUserMedia patch has to be in place before the scanner asks for it.
  // `sample` is deliberately not a dependency: reinstalling would hand out a
  // second MediaStream while the scanner is still holding the first, and
  // stopping the first one leaves it scanning a dead track. Payload changes are
  // repainted onto the same canvas instead, below.
  useEffect(() => {
    let cancelled = false;

    if (mode !== "fake") {
      fake.current?.restore();
      fake.current = null;
      setReady(mode === "real");
      return;
    }

    (async () => {
      const camera = await installFakeCamera(SAMPLES[0]);
      if (cancelled) {
        camera.restore();
        return;
      }
      fake.current = camera;
      setReady(true);
    })();

    return () => {
      cancelled = true;
      fake.current?.restore();
      fake.current = null;
    };
  }, [mode]);

  // Swap the payload on the live canvas — same stream, new content, which is
  // what a real camera being pointed at a different code looks like.
  useEffect(() => {
    void fake.current?.setText(SAMPLES[sample]);
  }, [sample]);

  const { videoRef, result, error, running } = useScanner({
    enabled: mode !== "off" && ready,
    onResult: (r) =>
      setLog((prev) =>
        [`${new Date().toLocaleTimeString()}  ${r.text}`, ...prev].slice(0, 8),
      ),
  });

  const stop = () => {
    setMode("off");
    setReady(false);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-8 font-mono text-sm">
      <header className="flex items-baseline gap-4">
        <h1 className="text-xl font-semibold">Camera scanner</h1>
        <Link href="/" className="underline">
          ← back
        </Link>
      </header>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => (mode === "real" ? stop() : setMode("real"))}
          className="rounded border border-current px-4 py-2"
        >
          {mode === "real" ? "Stop" : "Real camera"}
        </button>
        <button
          onClick={() => (mode === "fake" ? stop() : setMode("fake"))}
          className="rounded border border-current px-4 py-2"
        >
          {mode === "fake" ? "Stop" : "Simulated camera"}
        </button>
        {mode === "fake" && (
          <button
            onClick={() => setSample((s) => (s + 1) % SAMPLES.length)}
            className="rounded border border-dashed border-current px-4 py-2"
          >
            Next payload
          </button>
        )}
      </div>

      <p className="opacity-60">
        status: {running ? `scanning (${mode})` : mode === "off" ? "idle" : "starting…"}
      </p>
      {error != null && (
        <p className="text-red-600">
          {(error as { code?: string }).code ?? "error"} —{" "}
          {String((error as Error).message ?? error)}
        </p>
      )}

      {/* The hook attaches the stream to whatever this ref points at. */}
      <video ref={videoRef} playsInline muted className="w-full max-w-sm rounded bg-black" />

      {result && (
        <p className="break-all text-green-700" data-testid="latest">
          latest: {result.text}
        </p>
      )}
      <ul className="space-y-1 break-all opacity-70" data-testid="log">
        {log.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </main>
  );
}
