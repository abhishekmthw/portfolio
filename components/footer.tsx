import Link from "next/link";
import { Github, Linkedin, Mail } from "lucide-react";

import { profile } from "@/data/profile";
import { Magnetic } from "@/components/motion/magnetic";
import { cn } from "@/lib/utils";

const socials = [
  {
    label: "GitHub",
    href: profile.github,
    icon: Github,
    external: true,
  },
  {
    label: "LinkedIn",
    href: profile.linkedin,
    icon: Linkedin,
    external: true,
  },
  {
    label: "Email",
    href: `mailto:${profile.email}`,
    icon: Mail,
    external: false,
  },
] as const;

/**
 * Quiet, monospace "built with" footer with magnetic social icon links.
 * Stays a server component — the only interactivity (magnetic pull) is
 * delegated to the client <Magnetic> primitive, which also degrades to a
 * passthrough under reduced-motion / touch.
 */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative overflow-hidden border-t border-border/60">
      {/* Faint grid + glow ambiance behind the footer content. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-grid-pan bg-radial-fade opacity-[0.35]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-brand/50 to-transparent"
      />

      <div className="container flex flex-col items-center justify-between gap-5 py-10 font-mono text-sm sm:flex-row">
        <p className="text-center text-muted-foreground sm:text-left">
          <span className="text-syntax-comment">{"// "}</span>
          <span>built with </span>
          <span className="text-syntax-fn">Next.js</span>
          <span className="text-syntax-comment"> + </span>
          <span className="text-syntax-fn">Tailwind</span>
          <span className="text-muted-foreground/70"> · </span>
          <span className="text-syntax-number">©{" "}{year}</span>{" "}
          <span className="text-foreground">{profile.name}</span>
          <span className="caret ml-1 align-middle" aria-hidden />
        </p>

        <nav aria-label="Social links" className="flex items-center gap-1.5">
          {socials.map(({ label, href, icon: Icon, external }) => (
            <Magnetic key={label} strength={0.5}>
              <Link
                aria-label={label}
                href={href}
                {...(external
                  ? { target: "_blank", rel: "noreferrer" }
                  : {})}
                className={cn(
                  "group inline-flex h-10 w-10 items-center justify-center rounded-lg",
                  "border border-border/60 bg-card/40 text-muted-foreground backdrop-blur",
                  "transition-colors duration-200",
                  "hover:border-brand/60 hover:text-brand hover:glow-brand",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                )}
              >
                <Icon className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
              </Link>
            </Magnetic>
          ))}
        </nav>
      </div>
    </footer>
  );
}
