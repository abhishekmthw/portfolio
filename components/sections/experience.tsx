"use client";

import * as React from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { SectionHeading } from "@/components/section-heading";
import { Reveal } from "@/components/motion/reveal";
import { Parallax } from "@/components/motion/parallax";
import { HoverCard } from "@/components/motion/hover-card";
import { experience, type Experience as Job } from "@/data/experience";

/**
 * Deterministic 7-char hex "commit hash" derived from the job's identity.
 * Decorative only (no resume facts) — stable across renders so SSR matches.
 */
function commitHash(seed: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0").slice(0, 7);
}

export function Experience() {
  const reduceMotion = useReducedMotion();
  const timelineRef = React.useRef<HTMLOListElement>(null);

  // Fill the vertical line as the timeline scrolls through the viewport.
  const { scrollYProgress } = useScroll({
    target: timelineRef,
    offset: ["start 80%", "end 60%"],
  });
  const fill = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    mass: 0.4,
  });
  // Under reduced motion the line is simply fully drawn (static, calm).
  const scaleY = useTransform(fill, (v) => (reduceMotion ? 1 : v));

  return (
    <section id="experience" className="container scroll-mt-20 py-24">
      <SectionHeading
        eyebrow="experience"
        title="Where I&rsquo;ve worked."
        description="Across product teams in India and the UK since 2021 — building, migrating, and shipping."
      />

      {/* git-log header chrome */}
      <Reveal y={8} className="mb-8">
        <p className="font-mono text-xs text-muted-foreground">
          <span className="text-syntax-keyword">git</span>{" "}
          <span className="text-syntax-fn">log</span>{" "}
          <span className="text-syntax-comment">
            --pretty=career --graph
          </span>
        </p>
      </Reveal>

      <ol ref={timelineRef} className="relative ml-1 sm:ml-3">
        {/* Track (unfilled) */}
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-2 left-[7px] top-2 w-px bg-border/70"
        />
        {/* Progress fill — draws downward as you scroll */}
        <motion.span
          aria-hidden
          style={{ scaleY }}
          className="pointer-events-none absolute bottom-2 left-[7px] top-2 w-px origin-top bg-gradient-to-b from-brand to-brand2"
        />

        {experience.map((job, idx) => (
          <CommitNode key={`${job.company}-${job.period}`} job={job} index={idx} />
        ))}
      </ol>
    </section>
  );
}

function CommitNode({ job, index }: { job: Job; index: number }) {
  const hash = commitHash(`${job.company}|${job.role}|${job.period}`);
  const location = job.remote ? `${job.location} · Remote` : job.location;

  return (
    <li className="relative pb-10 pl-9 last:pb-0 sm:pl-12">
      {/* Commit node dot, sitting on the timeline */}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-3 grid h-3.5 w-3.5 place-items-center rounded-full ring-4 ring-background",
          job.current
            ? "bg-brand animate-glow-pulse glow-brand"
            : "bg-brand/70"
        )}
      >
        {job.current && (
          <span className="h-1.5 w-1.5 rounded-full bg-brand-foreground/90" />
        )}
      </span>

      <Parallax speed={0.12}>
        <Reveal y={20} delay={index === 0 ? 0 : 0.04}>
          <HoverCard className="overflow-hidden">
            {/* Commit meta line — monospace, git-flavored decoration */}
            <div className="flex items-center gap-2 border-b border-border/60 px-5 py-2.5 font-mono text-xs">
              <span className="text-syntax-number">commit</span>
              <span className="truncate text-syntax-comment">{hash}</span>
              {job.current && (
                <Badge
                  variant="brand"
                  className="ml-auto border-brand/40 font-mono"
                >
                  Current
                </Badge>
              )}
            </div>

            <div className="p-5 sm:p-6">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h3 className="text-lg font-semibold tracking-tight">
                  {job.role}
                  <span className="text-muted-foreground"> @ </span>
                  <span className="text-gradient">{job.company}</span>
                </h3>
                <span className="font-mono text-xs text-muted-foreground">
                  {job.period}
                </span>
              </div>

              <p className="font-mono text-xs text-syntax-comment">
                <span className="text-syntax-keyword">{"// "}</span>
                {location}
              </p>

              <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground sm:text-[0.95rem]">
                {job.bullets.map((b, i) => (
                  <li key={i} className="flex gap-3">
                    <span
                      aria-hidden
                      className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-brand/70"
                    />
                    <span className="leading-relaxed">{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          </HoverCard>
        </Reveal>
      </Parallax>
    </li>
  );
}
