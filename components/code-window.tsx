import * as React from "react";

import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  title?: string;
  className?: string;
  lang?: string;
};

/**
 * Presentational editor / code-window chrome.
 * Top bar with three traffic-light dots, an optional filename tab,
 * and an optional language badge, over a glassy body region.
 * Safe to use in client trees (no hooks, no side effects).
 */
export function CodeWindow({ children, title, className, lang }: Props) {
  return (
    <div
      className={cn(
        "glass overflow-hidden rounded-3xl border border-border/60",
        className
      )}
    >
      <div className="flex items-center gap-3 border-b border-border/60 bg-muted/30 px-4 py-2.5">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="h-3 w-3 rounded-full bg-[hsl(0_72%_60%)]" />
          <span className="h-3 w-3 rounded-full bg-[hsl(38_92%_58%)]" />
          <span className="h-3 w-3 rounded-full bg-[hsl(142_60%_48%)]" />
        </div>

        {title && (
          <span className="truncate rounded-md border border-border/50 bg-background/40 px-2.5 py-0.5 font-mono text-xs text-muted-foreground">
            {title}
          </span>
        )}

        {lang && (
          <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.18em] text-syntax-comment">
            {lang}
          </span>
        )}
      </div>

      <div className="p-4">{children}</div>
    </div>
  );
}
