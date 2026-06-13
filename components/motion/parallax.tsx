"use client";

import * as React from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";

import { cn } from "@/lib/utils";

export interface ParallaxProps {
  children: React.ReactNode;
  /**
   * Parallax strength. Positive values make the element move slower than the
   * scroll (classic parallax / depth). Default 0.3.
   */
  speed?: number;
  className?: string;
}

/**
 * translateY tied to the element's own scroll progress, smoothed with a spring.
 * Respects prefers-reduced-motion: renders a plain wrapper with no transform.
 */
export function Parallax({ children, speed = 0.3, className }: ParallaxProps) {
  const reduceMotion = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);

  // Track the element from when it enters the viewport (bottom) to when it
  // leaves (top): progress runs 0 -> 1 over that range.
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  // A positive speed moves the element slower than the page (upward as it
  // scrolls past). Magnitude is scaled to a pleasant pixel range.
  const range = speed * 120;
  const rawY = useTransform(scrollYProgress, [0, 1], [range, -range]);
  const y = useSpring(rawY, { stiffness: 120, damping: 30, mass: 0.4 });

  if (reduceMotion) {
    return (
      <div ref={ref} className={cn(className)}>
        {children}
      </div>
    );
  }

  return (
    <motion.div ref={ref} className={cn(className)} style={{ y }}>
      {children}
    </motion.div>
  );
}
