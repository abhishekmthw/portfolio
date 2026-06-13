"use client";

import * as React from "react";
import Lenis from "lenis";
import { useReducedMotion } from "framer-motion";

type Props = {
  children: React.ReactNode;
};

// Fixed navbar is h-16 (64px); offset anchor targets so headings aren't hidden.
const NAV_OFFSET = 64;

/**
 * Initializes Lenis smooth scrolling and intercepts in-page hash anchors so
 * navbar / anchor links scroll smoothly with a navbar-height offset.
 * reduced-motion => Lenis is NOT initialized; native smooth scroll (set in
 * globals.css) is used instead. SSR-safe (guards window).
 */
export function SmoothScroll({ children }: Props) {
  const reduced = useReducedMotion();

  React.useEffect(() => {
    if (reduced) return;
    if (typeof window === "undefined") return;

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });

    let frame = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);

    const onClick = (e: MouseEvent) => {
      // Respect modifier-clicks / non-primary buttons (open in new tab etc).
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      const anchor = target?.closest<HTMLAnchorElement>('a[href^="#"]');
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href === "#") return;

      const el = document.querySelector(href);
      if (!el) return;

      e.preventDefault();
      lenis.scrollTo(el as HTMLElement, { offset: -NAV_OFFSET });
    };

    document.addEventListener("click", onClick);

    return () => {
      document.removeEventListener("click", onClick);
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, [reduced]);

  return <>{children}</>;
}
