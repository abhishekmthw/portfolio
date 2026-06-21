"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LAB_MODELS } from "./models";

// The WebGL scene is client + browser-only; load it without SSR (it touches canvas
// APIs), showing a quiet placeholder while it streams.
const FluxLabScene = dynamic(() => import("./flux-lab-scene").then((m) => m.FluxLabScene), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center font-mono text-sm text-white/40">
      loading scene…
    </div>
  ),
});

const LOOP_MS = 6000; // dwell on each model before auto-advancing

export function FluxLab() {
  const [index, setIndex] = useState(0);
  const [looping, setLooping] = useState(false);
  const len = LAB_MODELS.length;
  const model = LAB_MODELS[index];

  const next = () => setIndex((i) => (i + 1) % len);
  const prev = () => setIndex((i) => (i - 1 + len) % len);

  // Auto-loop: endlessly advance through every model while enabled.
  useEffect(() => {
    if (!looping) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % len), LOOP_MS);
    return () => clearInterval(id);
  }, [looping, len]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#04050a] text-white">
      <FluxLabScene modelIndex={index} />

      {/* top label */}
      <div className="pointer-events-none absolute inset-x-0 top-0 p-5">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-white/45">
          Flux Lab · structure preview
        </p>
      </div>

      {/* bottom controls */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 px-6 pb-7 pt-10">
        {/* legibility scrim behind the controls */}
        <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-t from-black/70 via-black/40 to-transparent" />

        <div className="text-center">
          <h1 className="font-mono text-2xl font-bold tracking-tight sm:text-3xl">{model.name}</h1>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-white/60">
            {model.description}
          </p>
          <p className="mt-1.5 font-mono text-xs text-white/40">
            {index + 1} / {len}
          </p>
        </div>

        {/* direct-jump chips */}
        <div className="flex max-w-2xl flex-wrap justify-center gap-2">
          {LAB_MODELS.map((m, i) => (
            <button
              key={m.name}
              type="button"
              onClick={() => setIndex(i)}
              className={cn(
                "rounded-full border px-3 py-1 font-mono text-xs transition-colors",
                i === index
                  ? "border-[#8052ff] bg-[#8052ff]/25 text-white"
                  : "border-white/15 text-white/55 hover:border-white/45 hover:text-white/80"
              )}
            >
              {m.name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={prev} className="border-white/20 text-white hover:border-white/50 hover:text-white">
            ← Prev
          </Button>
          <Button onClick={() => setLooping((l) => !l)}>
            {looping ? "Stop loop" : "Loop all ▶"}
          </Button>
          <Button variant="outline" onClick={next} className="border-white/20 text-white hover:border-white/50 hover:text-white">
            Next →
          </Button>
        </div>
      </div>
    </div>
  );
}
