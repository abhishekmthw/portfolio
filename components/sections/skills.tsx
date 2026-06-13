"use client";

import { Reveal } from "@/components/motion/reveal";
import { HoverCard } from "@/components/motion/hover-card";
import { SectionHeading } from "@/components/section-heading";
import { cn } from "@/lib/utils";
import { skills } from "@/data/skills";

/**
 * Turn a human category label into a code-ish module token, e.g.
 * "Cloud & Infra" -> "cloud_infra". Purely decorative (the real label still
 * renders below). Falls back gracefully for any input.
 */
function toModuleName(category: string): string {
  return (
    category
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "skills"
  );
}

export function Skills() {
  return (
    <section id="skills" className="container scroll-mt-20 py-24">
      <SectionHeading
        eyebrow="skills"
        title="Tools I reach for."
        description="The stack I use day to day, grouped by where it lives."
      />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {skills.map((group, index) => {
          const moduleName = toModuleName(group.category);
          return (
            <Reveal key={group.category} delay={index * 0.08} y={20}>
              <HoverCard className="h-full p-5">
                {/* import statement header (decorative) */}
                <div className="font-mono text-[0.8rem] leading-relaxed">
                  <p className="text-syntax-comment">
                    {"// "}
                    {group.category}
                  </p>
                  <p className="mt-1 truncate">
                    <span className="text-syntax-keyword">import</span>{" "}
                    <span className="text-syntax-var">*</span>{" "}
                    <span className="text-syntax-keyword">as</span>{" "}
                    <span className="text-syntax-fn">{moduleName}</span>
                  </p>
                </div>

                {/* dependency / badge list */}
                <ul className="mt-4 flex flex-wrap gap-2">
                  {group.items.map((item) => (
                    <li key={item}>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-md border border-border/60 bg-muted/40 px-2.5 py-1",
                          "font-mono text-xs text-muted-foreground"
                        )}
                      >
                        <span aria-hidden className="mr-1.5 text-syntax-string/80">
                          {"+"}
                        </span>
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* footer count comment (decorative) */}
                <p className="mt-4 font-mono text-[0.7rem] text-muted-foreground/70">
                  <span className="text-syntax-comment">{"// "}</span>
                  <span className="text-syntax-number">{group.items.length}</span>{" "}
                  <span className="text-syntax-comment">
                    {group.items.length === 1 ? "package" : "packages"}
                  </span>
                </p>
              </HoverCard>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
