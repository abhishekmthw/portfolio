"use client";

import Link from "next/link";
import { ArrowRight, Github, Linkedin, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion/reveal";
import { Parallax } from "@/components/motion/parallax";
import { Typewriter } from "@/components/motion/typewriter";
import { Terminal, type TerminalLine } from "@/components/terminal";
import { cn } from "@/lib/utils";
import { profile } from "@/data/profile";

// Decorative role phrases for the typewriter. The CANONICAL role stays
// profile.title (first entry); the rest are tasteful dev-flavored extras.
const ROLE_PHRASES: string[] = [
  profile.title,
  "I ship full-stack web apps",
  "React · Next.js · Node · AWS",
  "from requirements to production",
];

// Intro terminal sequence — real profile fields for name/title/stack, with
// purely decorative command names.
const TERMINAL_LINES: TerminalLine[] = [
  { cmd: "whoami", out: profile.name, delay: 520 },
  { cmd: "cat role.txt", out: profile.title, delay: 520 },
  { cmd: "cat stack.txt", out: "MERN · Next.js · AWS · TypeScript", delay: 400 },
];

const firstName = profile.name.split(" ")[0];

export function Hero() {
  return (
    <section
      id="top"
      className="relative flex min-h-[100svh] items-center overflow-hidden pt-24"
    >
      <div className="container relative">
        <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr]">
          {/* ---- Left: headline + copy + CTAs ---- */}
          <div className="flex flex-col gap-6">
            <Reveal y={12} immediate>
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1 font-mono text-xs text-muted-foreground backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                Full-stack web &amp; cloud developer
              </div>
            </Reveal>

            <Reveal delay={0.06} immediate>
              <h1 className="text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
                Hi, I&apos;m{" "}
                <span className="text-gradient">{firstName}</span>.
                <span className="mt-3 block text-2xl font-semibold text-muted-foreground sm:text-3xl lg:text-4xl">
                  <span className="text-syntax-comment">&gt;_ </span>
                  <Typewriter
                    words={ROLE_PHRASES}
                    className="text-foreground"
                  />
                </span>
              </h1>
            </Reveal>

            <Reveal delay={0.12} immediate>
              <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
                {profile.summary}
              </p>
            </Reveal>

            <Reveal delay={0.18} immediate>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <Button asChild size="lg" className="glow-brand">
                  <Link href="#projects">
                    View projects
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="#contact">Get in touch</Link>
                </Button>
              </div>
            </Reveal>

            {/* Meta row revealed with a subtle parallax drift. */}
            <Parallax speed={0.18}>
              <Reveal delay={0.24} immediate>
                <div className="mt-4 flex flex-wrap items-center gap-4 font-mono text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-brand" />
                    {profile.location}
                  </span>
                  <Link
                    href={profile.github}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
                  >
                    <Github className="h-4 w-4" />
                    GitHub
                  </Link>
                  <Link
                    href={profile.linkedin}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
                  >
                    <Linkedin className="h-4 w-4" />
                    LinkedIn
                  </Link>
                </div>
              </Reveal>
            </Parallax>
          </div>

          {/* ---- Right: intro terminal, floating with light parallax depth ---- */}
          <Parallax speed={0.32} className="hidden lg:block">
            <Reveal delay={0.2} y={24} immediate>
              <div className={cn("animate-float [animation-duration:8s]")}>
                <Terminal
                  title="abhishek@portfolio:~"
                  lines={TERMINAL_LINES}
                  className="glow-brand"
                />
              </div>
            </Reveal>
          </Parallax>
        </div>

        {/* Terminal also shown on small screens (below the copy, no parallax). */}
        <div className="mt-10 lg:hidden">
          <Reveal delay={0.16} y={20} immediate>
            <Terminal
              title="abhishek@portfolio:~"
              lines={TERMINAL_LINES}
            />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
