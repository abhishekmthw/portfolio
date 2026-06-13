"use client";

import type * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Github, Linkedin, Mail, Phone } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/section-heading";
import { Reveal } from "@/components/motion/reveal";
import { CodeWindow } from "@/components/code-window";
import { Terminal, type TerminalLine } from "@/components/terminal";
import { profile } from "@/data/profile";

// Decorative-only: a friendly tel: href (strip spaces) and short link labels.
const telHref = `tel:${profile.phone.replace(/\s+/g, "")}`;

// Derive compact, human-readable handles from the profile URLs (no new facts —
// these are just the same links rendered without the protocol).
function stripProtocol(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

// Terminal "boot" sequence. The decorative command/label literals are allowed;
// the resume facts (email, location) still come from `profile`.
const terminalLines: TerminalLine[] = [
  { cmd: "whoami", out: profile.name, delay: 420 },
  { cmd: "cat role.txt", out: `${profile.title} · ${profile.location}`, delay: 420 },
  { cmd: "ping inbox", out: ["✓ inbox reachable — I read every email", `→ ${profile.email}`], delay: 480 },
];

type ContactLinkProps = {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  external?: boolean;
};

function ContactLink({ href, icon: Icon, label, value, external }: ContactLinkProps) {
  return (
    <Link
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className={cn(
        "glass group flex items-center gap-3 rounded-lg px-4 py-3 transition-colors",
        "hover:border-brand/50 hover:text-foreground"
      )}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border/60 bg-background/40 text-brand transition-colors group-hover:border-brand/50">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-syntax-comment">
          {label}
        </span>
        <span className="block truncate font-mono text-sm text-muted-foreground transition-colors group-hover:text-foreground">
          {value}
        </span>
      </span>
      <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

export function Contact() {
  return (
    <section id="contact" className="container scroll-mt-20 py-24">
      <div className="relative overflow-hidden rounded-2xl border border-border/60 p-6 sm:p-10 md:p-12">
        {/* Ambient background: animated panning grid + aurora glow, faded out. */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="bg-grid-pan bg-radial-fade absolute inset-0 opacity-[0.18]" />
          <div className="bg-aurora absolute inset-0 opacity-60" />
          <div className="absolute inset-0 bg-gradient-to-br from-brand/10 via-transparent to-brand2/10" />
        </div>

        <div className="relative">
          <SectionHeading
            eyebrow="Contact"
            title="Get in touch."
            description="Have a question, an idea, or just want to say hi? Drop a line — I read every email."
            align="center"
          />

          <div className="mx-auto grid max-w-4xl items-center gap-8 md:grid-cols-2">
            {/* Left: a self-introducing terminal. */}
            <Reveal y={20}>
              <Terminal
                title="contact.sh"
                prompt="$"
                lines={terminalLines}
                className="glow-brand"
              />
            </Reveal>

            {/* Right: the actual reach-out actions, framed as a config window. */}
            <Reveal y={20} delay={0.1}>
              <CodeWindow title="reach-out.config" lang="links">
                <div className="flex flex-col gap-4">
                  {/* Primary CTA: magnetic email button. */}
                  <Button asChild size="lg" className="glow-brand w-full">
                    <Link href={`mailto:${profile.email}`}>
                      <Mail className="h-4 w-4" />
                      <span className="truncate">{profile.email}</span>
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </Button>

                  <div className="flex flex-col gap-2.5">
                    <ContactLink
                      href={telHref}
                      icon={Phone}
                      label="call"
                      value={profile.phone}
                    />
                    <ContactLink
                      href={profile.github}
                      icon={Github}
                      label="github"
                      value={stripProtocol(profile.github)}
                      external
                    />
                    <ContactLink
                      href={profile.linkedin}
                      icon={Linkedin}
                      label="linkedin"
                      value={stripProtocol(profile.linkedin)}
                      external
                    />
                  </div>

                  <p className="flex items-center gap-2 font-mono text-xs text-syntax-comment">
                    <span className="text-syntax-keyword">{"//"}</span>
                    based in {profile.location}
                  </p>
                </div>
              </CodeWindow>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
