"use client";

import { motion, useScroll, useSpring } from "framer-motion";

/**
 * Fixed gradient progress bar at the top of the page. Its scaleX is driven by
 * the page scroll progress, smoothed with a spring. Scroll-linked (not
 * time-based), so it behaves fine under prefers-reduced-motion.
 */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 30,
    mass: 0.3,
  });

  return (
    <motion.div
      aria-hidden
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-[60] h-[2px] origin-left bg-gradient-to-r from-brand to-brand2"
    />
  );
}
