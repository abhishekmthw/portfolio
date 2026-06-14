"use client";

import Link from "next/link";
import { ArrowRight, Github, Linkedin, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion/reveal";
import { Parallax } from "@/components/motion/parallax";
import { Typewriter } from "@/components/motion/typewriter";
import { Terminal, type TerminalLine } from "@/components/terminal";
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

/**
 * Hero — a single LEFT column (text + terminal). The morphing particle brain
 * docks on the RIGHT (the fixed ConstellationBackdrop), so the copy never sits
 * on top of it. Content alternates sides down the page from here.
 */
export function Hero() {
  return (
    <section
      id="top"
      className="relative flex min-h-[100svh] items-center px-6 pt-28 pb-16 sm:px-10 lg:px-16"
    >
      <div className="flex w-full flex-col gap-6 lg:mr-auto lg:max-w-[42rem]">
        <Reveal y={12} immediate>
          <div className="inline-flex w-fit items-center gap-2.5 text-eyebrow text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            Full-stack web &amp; cloud developer
          </div>
        </Reveal>

        <Reveal delay={0.06} immediate>
          <h1 className="text-display-hero text-5xl sm:text-7xl lg:text-[6rem]">
            Hi, I&apos;m <span className="text-brand">{firstName}</span>.
            <span className="mt-5 block text-xl font-normal leading-snug tracking-normal text-muted-foreground sm:text-2xl lg:text-3xl">
              <span className="text-syntax-comment">&gt;_ </span>
              <Typewriter words={ROLE_PHRASES} className="text-foreground" />
            </span>
          </h1>
        </Reveal>

        <Reveal delay={0.12} immediate>
          <p className="max-w-xl text-base leading-relaxed tracking-[0.01em] text-muted-foreground sm:text-lg">
            {profile.summary}
          </p>
        </Reveal>

        <Reveal delay={0.18} immediate>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
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
            <div className="mt-2 flex flex-wrap items-center gap-4 font-mono text-sm text-muted-foreground">
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

        {/* Terminal sits beneath the copy (still in the left column). */}
        <Reveal delay={0.3} y={20} immediate>
          <div className="mt-4 max-w-[34rem]">
            <Terminal title="abhishek@portfolio:~" lines={TERMINAL_LINES} />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
