import Link from "next/link";
import { Github, Linkedin, Mail } from "lucide-react";

import { profile } from "@/data/profile";
import { Button } from "@/components/ui/button";

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
 * Quiet, monospace "built with" footer. Social icon links reuse the same
 * outline Button as the navbar theme toggle, so they share its border +
 * brand-glow hover. No client interactivity — stays a server component.
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
            <Button key={label} asChild variant="outline" size="icon">
              <Link
                aria-label={label}
                href={href}
                {...(external
                  ? { target: "_blank", rel: "noreferrer" }
                  : {})}
              >
                <Icon className="h-4 w-4" />
              </Link>
            </Button>
          ))}
        </nav>
      </div>
    </footer>
  );
}
