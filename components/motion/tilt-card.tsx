"use client";

import * as React from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";

import { cn } from "@/lib/utils";

export interface TiltCardProps {
  children: React.ReactNode;
  className?: string;
  /** Render a pointer-following radial glare highlight. Default true. */
  glare?: boolean;
  /** Max tilt in degrees on each axis. Default 10. */
  intensity?: number;
}

/**
 * 3D pointer tilt card. Tracks the pointer over the element and maps it to
 * rotateX / rotateY (clamped by `intensity`) with a perspective + spring; resets
 * on leave. An optional radial glare follows the pointer.
 *
 * Touch devices and prefers-reduced-motion render a static card (no listeners).
 */
export function TiltCard({
  children,
  className,
  glare = true,
  intensity = 10,
}: TiltCardProps) {
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

  // Normalized pointer position within the card: -0.5 .. 0.5 on each axis.
  const px = useMotionValue(0);
  const py = useMotionValue(0);

  const springCfg = { stiffness: 200, damping: 20, mass: 0.4 };
  const rotateX = useSpring(
    useTransform(py, [-0.5, 0.5], [intensity, -intensity]),
    springCfg,
  );
  const rotateY = useSpring(
    useTransform(px, [-0.5, 0.5], [-intensity, intensity]),
    springCfg,
  );

  // Glare position in percentages, derived from the same pointer values.
  const glareX = useTransform(px, [-0.5, 0.5], [0, 100]);
  const glareY = useTransform(py, [-0.5, 0.5], [0, 100]);
  const glareOpacity = useSpring(0, { stiffness: 200, damping: 30 });
  const glareBackground = useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, hsl(var(--brand) / 0.25), transparent 60%)`;

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    px.set((e.clientX - rect.left) / rect.width - 0.5);
    py.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  const handlePointerEnter = () => {
    glareOpacity.set(1);
  };

  const handlePointerLeave = () => {
    px.set(0);
    py.set(0);
    glareOpacity.set(0);
  };

  const disabled = reduceMotion || isTouch;

  if (disabled) {
    return (
      <div
        ref={ref}
        className={cn("glass rounded-xl", className)}
        style={{ transformStyle: "preserve-3d" }}
      >
        {children}
      </div>
    );
  }

  return (
    <motion.div
      ref={ref}
      onPointerMove={handlePointerMove}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      style={{
        rotateX,
        rotateY,
        transformStyle: "preserve-3d",
        transformPerspective: 1000,
      }}
      className={cn("glass relative rounded-xl", className)}
    >
      {children}
      {glare && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{ background: glareBackground, opacity: glareOpacity }}
        />
      )}
    </motion.div>
  );
}
