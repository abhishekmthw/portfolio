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
          <span className="font-mono text-xs tracking-tight text-syntax-comment">
            <span className="text-syntax-keyword">{"// "}</span>
            {eyebrow}
          </span>
        </Reveal>
      )}
      <Reveal y={12} delay={0.05}>
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
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
