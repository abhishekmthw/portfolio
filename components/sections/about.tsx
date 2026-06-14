"use client";

import * as React from "react";
import { Languages } from "lucide-react";

import { CodeWindow } from "@/components/code-window";
import { HoverCard } from "@/components/motion/hover-card";
import { Parallax } from "@/components/motion/parallax";
import { Reveal } from "@/components/motion/reveal";
import { SectionHeading } from "@/components/section-heading";
import { profile } from "@/data/profile";
import { cn } from "@/lib/utils";

export function About() {
  return (
    <section id="about" className="relative scroll-mt-24 px-6 py-24 sm:px-10 lg:px-16 lg:py-36">
      <div className="w-full lg:ml-auto lg:max-w-[40rem]">
      <SectionHeading
        eyebrow="About"
        title="A full stack developer who ships."
        description="The tl;dr — I build full stack web applications and the AWS scaffolding around them."
      />

      <Parallax speed={0.18}>
        <Reveal y={24}>
          <HoverCard bare>
            <CodeWindow title="about.ts" lang="ts">
            <div className="font-mono text-sm leading-relaxed sm:text-[15px]">
              {/* JSDoc-style block. Line numbers + syntax-colored tokens are
                  purely decorative; the paragraph TEXT is profile.about, verbatim. */}
              <div className="flex flex-col gap-1">
                <CodeLine n={1}>
                  <span className="text-syntax-comment">{"/**"}</span>
                </CodeLine>
                <CodeLine n={2}>
                  <span className="text-syntax-comment">
                    {" * "}
                    <span className="text-syntax-keyword">@author</span>{" "}
                    <span className="text-syntax-string">{profile.name}</span>
                  </span>
                </CodeLine>
                <CodeLine n={3}>
                  <span className="text-syntax-comment">
                    {" * "}
                    <span className="text-syntax-keyword">@role</span>{" "}
                    <span className="text-syntax-string">{profile.title}</span>
                  </span>
                </CodeLine>
                <CodeLine n={4}>
                  <span className="text-syntax-comment">{" *"}</span>
                </CodeLine>

                {profile.about.map((paragraph, i) => (
                  <CodeLine key={i} n={5 + i}>
                    <span className="text-syntax-comment">
                      {" * "}
                      <span className="text-foreground/90">{paragraph}</span>
                    </span>
                  </CodeLine>
                ))}

                <CodeLine n={5 + profile.about.length}>
                  <span className="text-syntax-comment">
                    {" */"}
                    <span className="caret ml-0.5 align-middle" aria-hidden="true" />
                  </span>
                </CodeLine>
              </div>
            </div>
            </CodeWindow>
          </HoverCard>
        </Reveal>
      </Parallax>

      <Reveal y={16} delay={0.1}>
        <div className="mt-8 flex items-center gap-2 font-mono text-sm text-muted-foreground">
          <Languages className="h-4 w-4 text-brand" aria-hidden="true" />
          <span>
            <span className="text-syntax-comment">{"// "}</span>
            Speaks {profile.spokenLanguages.join(", ")}.
          </span>
        </div>
      </Reveal>
      </div>
    </section>
  );
}

/**
 * A single line of the code-window body: a non-selectable gutter line number
 * (decorative) followed by the content. Keeps the JSDoc block readable while
 * letting long prose wrap with a hanging indent.
 */
function CodeLine({
  n,
  className,
  children,
}: {
  n: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex gap-4", className)}>
      <span
        className="w-6 flex-none select-none text-right text-xs leading-relaxed text-muted-foreground/40"
        aria-hidden="true"
      >
        {n}
      </span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
        {children}
      </span>
    </div>
  );
}
