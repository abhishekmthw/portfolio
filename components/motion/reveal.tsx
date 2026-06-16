"use client";

import * as React from "react";
import { motion, useReducedMotion, useInView } from "framer-motion";

import { cn } from "@/lib/utils";
import { useModelSettled } from "@/components/three/model-phase";

export interface RevealProps {
  children: React.ReactNode;
  /** Delay before the reveal animation starts, in seconds. */
  delay?: number;
  /** Initial vertical offset (px) the content slides up from. */
  y?: number;
  className?: string;
  /** Only animate the first time it enters the viewport. */
  once?: boolean;
  /**
   * Animate on mount instead of waiting for scroll-into-view. Use for
   * above-the-fold content (e.g. the hero) so it can never start blank.
   */
  immediate?: boolean;
}

/**
 * Fade + slide-up into view. Scroll-triggered reveals wait for BOTH the section
 * to be in view AND the 3D model to have SETTLED (its transition animation
 * finished) — so the cards/text don't pop in while the constellation is still
 * scattering/morphing between sections. `immediate` content (above the fold)
 * ignores both and animates on mount so it never starts blank.
 *
 * Respects prefers-reduced-motion: when reduced, children render statically (and
 * the model-settle gate is irrelevant, so content always shows).
 */
export function Reveal({
  children,
  delay = 0,
  y = 16,
  className,
  once = true,
  immediate = false,
}: RevealProps) {
  const reduceMotion = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once, margin: "-80px" });
  const settled = useModelSettled();
  const [revealed, setRevealed] = React.useState(false);

  // Reveal when in view AND the model has settled. `immediate` bypasses both.
  const show = immediate || (inView && settled);
  React.useEffect(() => {
    if (show) setRevealed(true);
  }, [show]);
  // `once` latches: once revealed it stays, even if the model transitions again.
  const visible = once ? revealed || show : show;

  if (reduceMotion) {
    return (
      <div ref={ref} className={cn(className)}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      ref={ref}
      className={cn(className)}
      initial={{ opacity: 0, y }}
      animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration: 0.55, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
    >
      {children}
    </motion.div>
  );
}
