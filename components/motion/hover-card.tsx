"use client";

import * as React from "react";
import { useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

export type HoverEffect =
  // cursor-reactive
  | "spotlight"
  | "tilt"
  | "magnetic"
  // transform
  | "lift"
  | "scale"
  | "float"
  // light / overlay
  | "glow"
  | "shine"
  | "gradient"
  | "beam"
  | "fill"
  | "ripple"
  | "scanline"
  // accent
  | "underline"
  | "brackets"
  // fx
  | "glitch"
  // combinations
  | "scaleBeam";

/** Ordered list of every effect, with display labels (used by the picker). */
export const HOVER_EFFECTS: { effect: HoverEffect; label: string }[] = [
  { effect: "spotlight", label: "Spotlight" },
  { effect: "tilt", label: "3D tilt" },
  { effect: "magnetic", label: "Magnetic" },
  { effect: "lift", label: "Lift" },
  { effect: "scale", label: "Scale" },
  { effect: "float", label: "Float" },
  { effect: "glow", label: "Glow border" },
  { effect: "shine", label: "Shine sweep" },
  { effect: "gradient", label: "Gradient wash" },
  { effect: "beam", label: "Border beam" },
  { effect: "fill", label: "Color fill" },
  { effect: "ripple", label: "Ripple" },
  { effect: "scanline", label: "Scanline" },
  { effect: "underline", label: "Underline" },
  { effect: "brackets", label: "HUD brackets" },
  { effect: "glitch", label: "Glitch" },
  { effect: "scaleBeam", label: "Scale + beam" },
];

const POINTER_EFFECTS: HoverEffect[] = ["spotlight", "tilt", "magnetic"];

/**
 * A card shell with a selectable hover `effect`. Effect overlays render on top
 * (pointer-events-none) so this also works as a transparent wrapper (`bare`)
 * around an existing card such as a CodeWindow. Under prefers-reduced-motion,
 * motion-based effects are dropped (subtle opacity/shadow accents are kept).
 */
export function HoverCard({
  // "scaleBeam" (Scale + beam) is the site-wide default for cards: omitting the
  // `effect` prop gives every card the standardized scale + animated border beam.
  effect = "scaleBeam",
  bare = false,
  className,
  children,
}: {
  effect?: HoverEffect;
  bare?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  const usesPointer = !reduce && POINTER_EFFECTS.includes(effect);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    if (effect === "spotlight") {
      el.style.setProperty("--mx", `${px}px`);
      el.style.setProperty("--my", `${py}px`);
    } else if (effect === "tilt") {
      const rx = (py / r.height - 0.5) * -10;
      const ry = (px / r.width - 0.5) * 10;
      el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg)`;
    } else if (effect === "magnetic") {
      const dx = (px - r.width / 2) * 0.15;
      const dy = (py - r.height / 2) * 0.15;
      el.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  };

  const onLeave = () => {
    const el = ref.current;
    if (el && (effect === "tilt" || effect === "magnetic")) el.style.transform = "";
  };

  return (
    <div
      ref={ref}
      onMouseMove={usesPointer ? onMove : undefined}
      onMouseLeave={usesPointer ? onLeave : undefined}
      className={cn(
        "group relative h-full overflow-hidden rounded-xl transition-all duration-300 ease-out [transform-style:preserve-3d]",
        !bare && "glass border border-border/60",
        !reduce &&
          effect === "lift" &&
          "hover:-translate-y-2 hover:border-brand/50 hover:shadow-2xl hover:shadow-brand/25",
        !reduce && effect === "scale" && "hover:scale-[1.03] hover:border-brand/50",
        !reduce && effect === "scaleBeam" && "hover:scale-[1.03]",
        !reduce && (effect === "tilt" || effect === "magnetic") && "duration-150",
        !reduce && effect === "float" && "hover:animate-float",
        effect === "glow" &&
          "hover:border-brand/60 hover:shadow-[0_0_30px_-6px_hsl(var(--brand)/0.55)]",
        !reduce &&
          effect === "glitch" &&
          "hover:animate-[fx-glitch_0.4s_steps(3)_infinite]",
        className
      )}
    >
      {children}

      {/* --- effect overlays (on top, non-interactive) --- */}
      {!reduce && effect === "spotlight" && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background:
              "radial-gradient(240px circle at var(--mx, 50%) var(--my, 50%), hsl(var(--brand) / 0.18), transparent 70%)",
          }}
        />
      )}

      {effect === "gradient" && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand/20 via-brand2/10 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        />
      )}

      {!reduce && effect === "shine" && (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 -translate-x-full bg-gradient-to-r from-transparent via-foreground/10 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[320%]" />
        </div>
      )}

      {effect === "fill" && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 origin-bottom scale-y-0 bg-gradient-to-t from-brand/20 to-brand/5 transition-transform duration-300 ease-out group-hover:scale-y-100"
        />
      )}

      {!reduce && effect === "ripple" && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[150%] -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-brand/10 transition-transform duration-500 ease-out group-hover:scale-100"
        />
      )}

      {effect === "underline" && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-gradient-to-r from-brand to-brand2 transition-transform duration-300 ease-out group-hover:scale-x-100"
        />
      )}

      {(effect === "beam" || effect === "scaleBeam") && (
        <div
          aria-hidden
          className="fx-beam-ring pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        />
      )}

      {!reduce && effect === "scanline" && (
        <div
          aria-hidden
          className="fx-scanlines pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        />
      )}

      {effect === "brackets" && (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute left-2 top-2 h-4 w-4 origin-top-left scale-50 border-l-2 border-t-2 border-brand opacity-0 transition-all duration-300 group-hover:scale-100 group-hover:opacity-100"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute right-2 top-2 h-4 w-4 origin-top-right scale-50 border-r-2 border-t-2 border-brand opacity-0 transition-all duration-300 group-hover:scale-100 group-hover:opacity-100"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-2 left-2 h-4 w-4 origin-bottom-left scale-50 border-b-2 border-l-2 border-brand opacity-0 transition-all duration-300 group-hover:scale-100 group-hover:opacity-100"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-2 right-2 h-4 w-4 origin-bottom-right scale-50 border-b-2 border-r-2 border-brand opacity-0 transition-all duration-300 group-hover:scale-100 group-hover:opacity-100"
          />
        </>
      )}
    </div>
  );
}
