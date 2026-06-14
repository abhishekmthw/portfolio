"use client";

import { cn } from "@/lib/utils";
import { Reveal } from "@/components/motion/reveal";

type Props = {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
  align?: "left" | "center";
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  className,
  align = "left",
}: Props) {
  return (
    <div
      className={cn(
        "mb-12 flex flex-col gap-3",
        align === "center" && "items-center text-center",
        className
      )}
    >
      {eyebrow && (
        <Reveal y={8}>
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-syntax-comment">
            <span className="text-brand">{"// "}</span>
            {eyebrow}
          </span>
        </Reveal>
      )}
      <Reveal y={12} delay={0.05}>
        <h2 className="text-display text-4xl sm:text-5xl lg:text-[3.5rem]">
          {title}
        </h2>
      </Reveal>
      {description && (
        <Reveal y={12} delay={0.1}>
          <p
            className={cn(
              "max-w-2xl text-base text-muted-foreground sm:text-lg",
              align === "center" && "mx-auto"
            )}
          >
            {description}
          </p>
        </Reveal>
      )}
    </div>
  );
}
