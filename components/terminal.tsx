"use client";

import * as React from "react";
import { useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import { CodeWindow } from "@/components/code-window";

export type TerminalLine = {
  cmd?: string;
  out?: string | string[];
  delay?: number;
};

type Props = {
  lines: TerminalLine[];
  className?: string;
  prompt?: string;
  title?: string;
};

const DEFAULT_TYPING_MS = 38;

function toOutLines(out: TerminalLine["out"]): string[] {
  if (out === undefined) return [];
  return Array.isArray(out) ? out : [out];
}

function OutputLine({ text }: { text: string }) {
  // Tasteful success-marker coloring without hardcoding resume content.
  const isSuccess = /^\s*(✓|✔|√|done|success)/i.test(text);
  return (
    <div
      className={cn(
        "whitespace-pre-wrap break-words",
        isSuccess ? "text-syntax-string" : "text-muted-foreground"
      )}
    >
      {text}
    </div>
  );
}

/**
 * Animated terminal rendered inside CodeWindow chrome.
 * Sequentially types each line.cmd after the prompt, then prints its
 * output, then advances, with a trailing blinking caret.
 * reduced-motion (or pre-mount SSR) => renders all lines instantly.
 */
export function Terminal({ lines, className, prompt = "$", title }: Props) {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = React.useState(false);

  // How many lines are fully revealed.
  const [lineIndex, setLineIndex] = React.useState(0);
  // How many characters of the current command have been typed.
  const [charCount, setCharCount] = React.useState(0);

  React.useEffect(() => setMounted(true), []);

  // Drive the typing sequence. Skipped entirely when reduced-motion or
  // before mount (to avoid an SSR hydration mismatch).
  React.useEffect(() => {
    if (reduced || !mounted) return;
    if (lineIndex >= lines.length) return;

    const line = lines[lineIndex];
    const cmd = line.cmd ?? "";

    // Still typing the command for the current line.
    if (charCount < cmd.length) {
      const id = window.setTimeout(
        () => setCharCount((c) => c + 1),
        DEFAULT_TYPING_MS
      );
      return () => window.clearTimeout(id);
    }

    // Command typed (or no command) -> reveal output + advance to next line.
    const id = window.setTimeout(() => {
      setLineIndex((i) => i + 1);
      setCharCount(0);
    }, line.delay ?? 360);
    return () => window.clearTimeout(id);
  }, [reduced, mounted, lineIndex, charCount, lines]);

  // Render every line at once for the static (reduced-motion / SSR) path.
  const showAll = reduced || !mounted;
  const isComplete = showAll || lineIndex >= lines.length;

  return (
    <CodeWindow title={title} className={className} lang="bash">
      <div className="font-mono text-sm leading-relaxed">
        {lines.map((line, i) => {
          const fullyDone = showAll || i < lineIndex;
          const isActive = !showAll && i === lineIndex;
          // Hide lines that haven't been reached yet.
          if (!fullyDone && !isActive) return null;

          const cmd = line.cmd ?? "";
          const typedCmd = fullyDone ? cmd : cmd.slice(0, charCount);
          const stillTyping = isActive && charCount < cmd.length;
          // Output appears only once the line's command has finished typing.
          const showOutput = fullyDone;

          return (
            <div key={i} className="mb-1.5 last:mb-0">
              {line.cmd !== undefined && (
                <div className="flex gap-2">
                  <span className="select-none text-brand">{prompt}</span>
                  <span className="text-foreground">
                    {typedCmd}
                    {stillTyping && (
                      <span className="caret" aria-hidden="true" />
                    )}
                  </span>
                </div>
              )}

              {showOutput &&
                toOutLines(line.out).map((o, j) => (
                  <OutputLine key={j} text={o} />
                ))}
            </div>
          );
        })}

        {/* Resting prompt + blinking caret once the sequence is complete. */}
        {isComplete && (
          <div className="flex gap-2">
            <span className="select-none text-brand">{prompt}</span>
            <span className="caret" aria-hidden="true" />
          </div>
        )}
      </div>
    </CodeWindow>
  );
}
