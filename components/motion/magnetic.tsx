"use client";

import * as React from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";

import { cn } from "@/lib/utils";

export interface MagneticProps {
  children: React.ReactNode;
  /**
   * How strongly the child is pulled toward the cursor (0..1+). Default 0.4.
   */
  strength?: number;
  className?: string;
}

/**
 * Wraps a single interactive element; on pointer move within its bounds the
 * child translates toward the cursor with a spring, springing back to 0 on
 * leave.
 *
 * Touch devices and prefers-reduced-motion render a passthrough wrapper.
 */
export function Magnetic({ children, strength = 0.4, className }: MagneticProps) {
  const reduceMotion = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);

  // Detect coarse (touch) pointers after mount to avoid SSR mismatch.
  const [isTouch, setIsTouch] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(hover: none), (pointer: coarse)");
    const update = () => setIsTouch(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const springCfg = { stiffness: 220, damping: 18, mass: 0.3 };
  const springX = useSpring(x, springCfg);
  const springY = useSpring(y, springCfg);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const relX = e.clientX - (rect.left + rect.width / 2);
    const relY = e.clientY - (rect.top + rect.height / 2);
    x.set(relX * strength);
    y.set(relY * strength);
  };

  const handlePointerLeave = () => {
    x.set(0);
    y.set(0);
  };

  if (reduceMotion || isTouch) {
    return (
      <div ref={ref} className={cn("inline-block", className)}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      ref={ref}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={{ x: springX, y: springY }}
      className={cn("inline-block", className)}
    >
      {children}
    </motion.div>
  );
}
