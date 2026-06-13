"use client";

import * as React from "react";
import { useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

export interface TypewriterProps {
  /** The words/phrases to cycle through. */
  words: string[];
  className?: string;
  /** Per-character typing speed in ms. Default 90. */
  typingSpeed?: number;
  /** Per-character deleting speed in ms. Default 45. */
  deletingSpeed?: number;
  /** Pause (ms) once a word is fully typed before deleting. Default 1400. */
  pause?: number;
  /** Loop back to the first word after the last. Default true. */
  loop?: boolean;
}

/**
 * Types a word, pauses, deletes, then advances to the next word with a blinking
 * caret. Guards against SSR hydration mismatch by starting only after mount.
 *
 * prefers-reduced-motion: renders words[0] statically with a static caret.
 */
export function Typewriter({
  words,
  className,
  typingSpeed = 90,
  deletingSpeed = 45,
  pause = 1400,
  loop = true,
}: TypewriterProps) {
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = React.useState(false);
  const [text, setText] = React.useState("");
  const [wordIndex, setWordIndex] = React.useState(0);
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const safeWords = React.useMemo(
    () => (words.length > 0 ? words : [""]),
    [words],
  );

  React.useEffect(() => {
    if (!mounted || reduceMotion) return;

    const current = safeWords[wordIndex % safeWords.length] ?? "";

    // Finished typing the word -> pause, then start deleting.
    if (!deleting && text === current) {
      const isLast = wordIndex === safeWords.length - 1;
      if (!loop && isLast) return; // settle on final word
      const t = setTimeout(() => setDeleting(true), pause);
      return () => clearTimeout(t);
    }

    // Finished deleting -> advance to the next word.
    if (deleting && text === "") {
      setDeleting(false);
      setWordIndex((i) => (i + 1) % safeWords.length);
      return;
    }

    const t = setTimeout(
      () => {
        setText((prev) =>
          deleting
            ? current.slice(0, prev.length - 1)
            : current.slice(0, prev.length + 1),
        );
      },
      deleting ? deletingSpeed : typingSpeed,
    );
    return () => clearTimeout(t);
  }, [
    mounted,
    reduceMotion,
    text,
    deleting,
    wordIndex,
    safeWords,
    typingSpeed,
    deletingSpeed,
    pause,
    loop,
  ]);

  // Static, hydration-safe render for SSR + reduced motion.
  const display = !mounted || reduceMotion ? safeWords[0] : text;

  return (
    <span className={cn("inline-flex items-baseline", className)}>
      <span>{display}</span>
      <span className="caret" aria-hidden />
    </span>
  );
}
