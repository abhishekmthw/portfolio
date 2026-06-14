"use client";

import { GraduationCap, Award } from "lucide-react";

import { SectionHeading } from "@/components/section-heading";
import { Reveal } from "@/components/motion/reveal";
import { HoverCard } from "@/components/motion/hover-card";
import { cn } from "@/lib/utils";
import { education, accomplishments } from "@/data/education";

export function Education() {
  return (
    <section id="education" className="relative scroll-mt-24 px-6 py-24 sm:px-10 lg:px-16 lg:py-36">
      <div className="w-full lg:ml-auto lg:max-w-[52rem]">
      <SectionHeading
        eyebrow="education"
        title="Background."
        description="Formal education and certifications."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Degrees */}
        <div className="flex flex-col gap-4">
          <Reveal delay={0.02}>
            <p className="mb-1 font-mono text-xs text-syntax-comment">
              {"// degrees"}
            </p>
          </Reveal>

          {education.map((e, i) => (
            <Reveal key={i} delay={0.06 + i * 0.08} y={20}>
              <HoverCard className="group h-full p-6">
                <div className="flex gap-4">
                  <div
                    aria-hidden
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                      "bg-brand/15 text-brand ring-1 ring-brand/20",
                      "transition-all duration-300 group-hover:bg-brand/25 group-hover:shadow-[0_0_24px_-4px_hsl(var(--brand)/0.55)]",
                    )}
                  >
                    <GraduationCap className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold tracking-tight text-foreground">
                      {e.qualification}
                    </h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {e.institution}
                      <span className="text-muted-foreground/60"> · </span>
                      {e.location}
                    </p>
                    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs">
                      <span className="text-syntax-fn">{e.period}</span>
                      {e.detail ? (
                        <>
                          <span className="text-muted-foreground/50">|</span>
                          <span className="text-syntax-number">
                            {e.detail}
                          </span>
                        </>
                      ) : null}
                    </p>
                  </div>
                </div>
              </HoverCard>
            </Reveal>
          ))}
        </div>

        {/* Certifications */}
        <div className="flex flex-col gap-4">
          <Reveal delay={0.04}>
            <p className="mb-1 font-mono text-xs text-syntax-comment">
              {"// certifications"}
            </p>
          </Reveal>

          {accomplishments.map((a, i) => (
            <Reveal key={i} delay={0.08 + i * 0.08} y={20}>
              <HoverCard className="group h-full p-6">
                <div className="mb-4 flex items-center gap-3">
                  <div
                    aria-hidden
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                      "bg-brand/15 text-brand ring-1 ring-brand/20",
                      "transition-all duration-300 group-hover:bg-brand/25 group-hover:shadow-[0_0_24px_-4px_hsl(var(--brand)/0.55)]",
                    )}
                  >
                    <Award className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold tracking-tight text-foreground">
                      {a.title}
                    </h3>
                    <p className="mt-0.5 font-mono text-xs text-syntax-fn">
                      {a.issuer}
                    </p>
                  </div>
                </div>

                <ul className="grid gap-x-4 gap-y-1.5 text-sm text-muted-foreground sm:grid-cols-2">
                  {a.details.map((d, j) => (
                    <li key={j} className="flex items-start gap-2">
                      <span
                        aria-hidden
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand/80 ring-1 ring-brand/30"
                      />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </HoverCard>
            </Reveal>
          ))}
        </div>
      </div>
      </div>
    </section>
  );
}
