"use client";

import dynamic from "next/dynamic";

/**
 * CSS-only fallback painted under/instead of the WebGL field: a sparse static
 * violet drift on the void. Shown until the R3F scene streams in, and the
 * permanent backdrop for anyone who never gets the canvas (also a no-op under
 * reduced-motion via globals.css).
 */
function FieldFallback() {
  return (
    <div className="absolute inset-0" aria-hidden="true">
      <div className="bg-grid-pan bg-radial-fade absolute inset-0 opacity-[0.12]" />
      <div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/15 blur-3xl" />
    </div>
  );
}

// React Three Fiber v8 must be client-only; load via next/dynamic (ssr:false)
// with the CSS fallback shown while it streams.
const ParticleField = dynamic(() => import("@/components/three/particle-field"), {
  ssr: false,
  loading: () => <FieldFallback />,
});

/**
 * ConstellationBackdrop — a FIXED, page-spanning layer behind all content. The
 * particle field reads global scroll progress, so it persists across every
 * section and morphs brain → bulb → globe as the visitor scrolls the page.
 *
 * Mount once at the page root (behind <main/>). A soft radial vignette keeps
 * copy legible where the field is densest, without breaking the pure void.
 */
export function ConstellationBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <ParticleField />
      <FieldFallback />
      {/* gentle edge vignette — keeps the docked model bright while softening
          the extreme corners so side-docked content stays legible */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_70%,hsl(var(--background)/0.75)_100%)]" />
    </div>
  );
}
