"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { navItems } from "@/data/navigation";
import { profile } from "@/data/profile";

/** Section ids tracked for active-link highlighting, derived from nav hrefs. */
const SECTION_IDS = navItems.map((item) => item.href.replace(/^#/, ""));

export function Navbar() {
  const reduceMotion = useReducedMotion();
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState<string>("");

  // Blur + brand-glow border once the page has scrolled past the hero edge.
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Active-section highlighting via IntersectionObserver on the section ids.
  React.useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      return;
    }

    const sections = SECTION_IDS.map((id) =>
      document.getElementById(id)
    ).filter((el): el is HTMLElement => el !== null);

    if (sections.length === 0) return;

    // Track the most "visible" section; offset the top by the fixed navbar.
    const visibility = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visibility.set(
            entry.target.id,
            entry.isIntersecting ? entry.intersectionRatio : 0
          );
        }

        let best = "";
        let bestRatio = 0;
        visibility.forEach((ratio, id) => {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            best = id;
          }
        });

        if (best && bestRatio > 0) setActive(best);
      },
      {
        // Bias toward the section sitting just under the fixed 64px header.
        rootMargin: "-64px 0px -55% 0px",
        threshold: [0.1, 0.25, 0.5, 0.75, 1],
      }
    );

    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // Close the mobile menu on resize up to desktop to avoid a stuck overlay.
  React.useEffect(() => {
    if (!open) return;
    const onResize = () => {
      if (window.innerWidth >= 768) setOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  const initials = profile.name
    .split(" ")
    .map((n) => n[0])
    .join("");

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled
          ? "border-b border-border bg-background/70 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      )}
    >
      <div className="container relative flex h-16 items-center justify-between">
        {/* Logo: initials + name. */}
        <Link
          href="#top"
          aria-label={`${profile.name} — back to top`}
          className="group flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="grid h-8 w-8 place-items-center rounded-md border border-brand/30 bg-brand/15 font-mono text-sm font-bold text-brand shadow-[0_0_0_0_transparent] transition-shadow duration-300 group-hover:shadow-[0_0_18px_-2px_hsl(var(--brand)/0.6)]">
            {initials}
          </span>
          <span className="text-sm font-semibold tracking-tight">
            {profile.name}
          </span>
        </Link>

        {/* Desktop nav — dev/terminal styling: monospace, "#" prefix, active glow. */}
        <nav
          aria-label="Primary"
          className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 md:flex"
        >
          {navItems.map((item) => {
            const id = item.href.replace(/^#/, "");
            const isActive = active === id;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative rounded-md px-3 py-2 font-mono text-sm transition-colors outline-none",
                  "focus-visible:ring-2 focus-visible:ring-brand/60",
                  isActive
                    ? "text-brand"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "mr-0.5 transition-colors",
                    isActive ? "text-brand" : "text-syntax-comment"
                  )}
                >
                  #
                </span>
                {item.label.toLowerCase()}

                {/* Active underline — shared layout pill that slides between links. */}
                {isActive &&
                  (reduceMotion ? (
                    <span className="absolute inset-x-2 -bottom-px h-px bg-brand" />
                  ) : (
                    <motion.span
                      layoutId="nav-active-underline"
                      className="absolute inset-x-2 -bottom-px h-px bg-gradient-to-r from-brand to-brand2 shadow-[0_0_8px_0_hsl(var(--brand)/0.7)]"
                      transition={{
                        type: "spring",
                        stiffness: 380,
                        damping: 30,
                      }}
                    />
                  ))}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {/* Terminal action — the only filled pill in the header (Dala). */}
          <Button asChild size="sm" className="hidden md:inline-flex">
            <Link href="#contact">Get in touch</Link>
          </Button>
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="mobile-nav"
            key="mobile-nav"
            initial={reduceMotion ? false : { opacity: 0, height: 0 }}
            animate={reduceMotion ? {} : { opacity: 1, height: "auto" }}
            exit={reduceMotion ? {} : { opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden border-b border-brand/20 bg-background/95 backdrop-blur-xl md:hidden"
          >
            <nav
              aria-label="Mobile"
              className="container flex flex-col py-3"
            >
              {navItems.map((item) => {
                const id = item.href.replace(/^#/, "");
                const isActive = active === id;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "rounded-md px-3 py-2 font-mono text-sm transition-colors outline-none",
                      "focus-visible:ring-2 focus-visible:ring-brand/60",
                      isActive
                        ? "bg-brand/10 text-brand"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mr-1",
                        isActive ? "text-brand" : "text-syntax-comment"
                      )}
                    >
                      #
                    </span>
                    {item.label.toLowerCase()}
                  </Link>
                );
              })}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
