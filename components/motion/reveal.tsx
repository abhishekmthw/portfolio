"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

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
 * Fade + slide-up into view via framer-motion `whileInView`.
 * Respects prefers-reduced-motion: when reduced, children render with no
 * transform/opacity animation.
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

  if (reduceMotion) {
    return <div className={cn(className)}>{children}</div>;
  }

  const target = { opacity: 1, y: 0 };

  return (
    <motion.div
      className={cn(className)}
      initial={{ opacity: 0, y }}
      {...(immediate
        ? { animate: target }
        : { whileInView: target, viewport: { once, margin: "-80px" } })}
      transition={{ duration: 0.55, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
    >
      {children}
    </motion.div>
  );
}
