"use client";

import dynamic from "next/dynamic";

/**
 * Lightweight CSS-only fallback painted under/instead of the WebGL scene:
 * an animated panning grid plus a soft brand/brand2 glow. Shown until the
 * R3F scene loads, and is the permanent backdrop for users who never get
 * the canvas (it's also a no-op under reduced-motion thanks to globals.css).
 */
function HeroSceneFallback() {
  return (
    <div className="absolute inset-0" aria-hidden="true">
      <div className="bg-grid-pan bg-radial-fade absolute inset-0 opacity-50" />
      <div className="animate-float absolute -top-24 left-1/2 h-[440px] w-[860px] -translate-x-1/2 rounded-full bg-brand/20 blur-3xl" />
      <div className="absolute right-[8%] top-1/3 h-[320px] w-[320px] rounded-full bg-brand2/10 blur-3xl" />
    </div>
  );
}

// The WebGL hero scene MUST be client-only (React Three Fiber v8 / drei v9)
// and loaded via next/dynamic with ssr:false, with the CSS fallback shown
// while it streams in.
const HeroScene = dynamic(() => import("@/components/three/hero-scene"), {
  ssr: false,
  loading: () => <HeroSceneFallback />,
});

/**
 * 3D backdrop anchored to the TOP of the Hero + About region. It's a normal
 * (non-sticky) viewport-tall layer, so the wireframe stays at the top and
 * scrolls away naturally with the page. The terrain is framed to fit fully
 * within this viewport-height layer (see hero-scene.tsx), so it isn't clipped
 * at the bottom edge; the bottom is also feathered (hero-scene-fade) as a
 * safety net.
 *
 * Place this as the first child of a `relative` wrapper around <Hero/> +
 * <About/>; the outer layer spans that wrapper and the inner layer occupies
 * the top viewport.
 */
export function HeroBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10">
      <div className="hero-scene-fade absolute inset-x-0 top-0 h-[100svh] overflow-hidden">
        <HeroScene />
        <HeroSceneFallback />
        {/* Readability scrim — darkens the left, where the hero/about copy sits. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-transparent"
        />
      </div>
    </div>
  );
}
