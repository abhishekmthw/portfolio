"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, FileText, Github, Folder, Maximize2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { SectionHeading } from "@/components/section-heading";
import { Reveal } from "@/components/motion/reveal";
import { Parallax } from "@/components/motion/parallax";
import { HoverCard } from "@/components/motion/hover-card";
import { CrypSavvyPreview } from "@/components/projects/crypsavvy-preview";
import { projects, type Project } from "@/data/projects";

const statusLabel: Record<Project["status"], string> = {
  "in-development": "In development",
  live: "Live",
  archived: "Archived",
};

const statusDot: Record<Project["status"], string> = {
  "in-development": "bg-amber",
  live: "bg-emerald-400",
  archived: "bg-muted-foreground",
};

/** Interactive UI demos, keyed by `project.preview`. */
const previews: Record<
  NonNullable<Project["preview"]>,
  React.ComponentType
> = {
  crypsavvy: CrypSavvyPreview,
};

/**
 * The link row sits inside a clickable card, so clicks on it must not also open
 * the modal.
 */
function ProjectLinks({
  project,
  size = "sm",
}: {
  project: Project;
  size?: "sm" | "default";
}) {
  const { live, repo, case_study } = project.links ?? {};
  if (!live && !repo && !case_study) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {live && (
        <Button asChild size={size}>
          <Link href={live} target="_blank" rel="noreferrer">
            {project.liveLabel ?? "Visit"}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      )}
      {repo && (
        <Button asChild size={size} variant="outline">
          <Link href={repo} target="_blank" rel="noreferrer">
            <Github className="h-3.5 w-3.5" />
            Source
          </Link>
        </Button>
      )}
      {case_study && (
        <Button asChild size={size} variant="ghost">
          <Link href={case_study}>
            <FileText className="h-3.5 w-3.5" />
            Case study
          </Link>
        </Button>
      )}
    </div>
  );
}

function ProjectCard({
  project,
  onOpen,
}: {
  project: Project;
  onOpen: () => void;
}) {
  const stack = project.cardStack ?? project.stack.slice(0, 6);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      aria-label={`${project.name} — open details`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="cursor-pointer rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <HoverCard className="group h-full overflow-hidden rounded-3xl border-border/60">
        {/* Animated gradient accent from the data-driven project.accent. */}
        <div
          className={cn(
            "pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br opacity-60 transition-opacity duration-500 group-hover:opacity-100",
            project.accent ?? "from-brand/15 via-brand/5 to-transparent"
          )}
          aria-hidden
        />
        {/* Soft brand glow that intensifies on hover (depth cue). */}
        <div
          className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-hover:glow-brand"
          aria-hidden
        />

        <div className="flex h-full flex-col gap-5 p-6">
          {/* Editor-chrome style header: filename tab + status pill. */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 font-mono text-xs text-syntax-comment">
              <Folder className="h-3.5 w-3.5 text-syntax-fn" aria-hidden />
              <span className="truncate">{project.slug}/</span>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-2.5 py-1 font-mono text-xs text-muted-foreground">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  statusDot[project.status]
                )}
                aria-hidden
              />
              {statusLabel[project.status]}
            </span>
          </div>

          <div>
            <h3 className="text-2xl font-semibold tracking-tight">
              {project.name}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {project.tagline}
            </p>
          </div>

          <p className="text-sm leading-relaxed text-muted-foreground">
            {project.summary}
          </p>

          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {project.cardHighlights.map((h, i) => (
              <li key={i} className="flex gap-2">
                <span
                  className="mt-1.5 font-mono text-xs leading-none text-syntax-string"
                  aria-hidden
                >
                  +
                </span>
                <span>{h}</span>
              </li>
            ))}
          </ul>

          {project.metrics && (
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {project.metrics.map((m) => (
                <div key={m.label}>
                  <div className="font-mono text-lg leading-none text-foreground">
                    {m.value}
                  </div>
                  <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {m.label}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-auto flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {stack.map((s) => (
                <Badge key={s} variant="muted" className="font-mono">
                  {s}
                </Badge>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <ProjectLinks project={project} />
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground transition-colors group-hover:text-brand">
                <Maximize2 className="h-3 w-3" aria-hidden />
                Read more
              </span>
            </div>
          </div>
        </div>
      </HoverCard>
    </div>
  );
}

function ProjectModal({
  project,
  open,
  onOpenChange,
}: {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const Preview = project?.preview ? previews[project.preview] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {project && (
          <>
            <div className="shrink-0 border-b border-border/60 bg-card/80 px-6 py-5 pr-16 backdrop-blur">
              <div className="flex items-center gap-2 font-mono text-xs text-syntax-comment">
                <Folder className="h-3.5 w-3.5 text-syntax-fn" aria-hidden />
                <span>{project.slug}/</span>
                <span
                  className={cn(
                    "ml-1 h-1.5 w-1.5 rounded-full",
                    statusDot[project.status]
                  )}
                  aria-hidden
                />
                <span>{statusLabel[project.status]}</span>
              </div>
              <DialogTitle className="mt-2">{project.name}</DialogTitle>
              <DialogDescription className="mt-1">
                {project.tagline}
              </DialogDescription>
              <div className="mt-4">
                <ProjectLinks project={project} />
              </div>
            </div>

            <div className="no-scrollbar min-h-0 flex-1 space-y-8 overflow-y-auto overscroll-contain px-6 py-6">
              <div className="space-y-3">
                {project.overview.map((p, i) => (
                  <p key={i} className="text-sm leading-relaxed text-muted-foreground">
                    {p}
                  </p>
                ))}
              </div>

              {Preview && (
                <div className="space-y-2">
                  <h4 className="text-eyebrow text-brand">the dashboard</h4>
                  <Preview />
                </div>
              )}

              {project.sections.map((section) => (
                <div key={section.title} className="space-y-2">
                  <h4 className="text-eyebrow text-brand">{section.title}</h4>
                  <ul className="space-y-1.5">
                    {section.points.map((point, i) => (
                      <li
                        key={i}
                        className="flex gap-2 text-sm leading-relaxed text-muted-foreground"
                      >
                        <span
                          className="mt-1.5 font-mono text-xs leading-none text-syntax-string"
                          aria-hidden
                        >
                          +
                        </span>
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              <div className="space-y-2">
                <h4 className="text-eyebrow text-brand">stack</h4>
                <div className="flex flex-wrap gap-2">
                  {project.stack.map((s) => (
                    <Badge key={s} variant="muted" className="font-mono">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="border-t border-border/60 pt-6">
                <ProjectLinks project={project} />
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function Projects() {
  const [activeSlug, setActiveSlug] = React.useState<string | null>(null);
  const active = projects.find((p) => p.slug === activeSlug) ?? null;

  return (
    <section
      id="projects"
      className="relative scroll-mt-24 px-6 py-24 sm:px-10 lg:px-16 lg:py-36"
    >
      <div className="w-full lg:mr-auto lg:max-w-[40rem]">
        <SectionHeading
          eyebrow="projects"
          title="Things I&rsquo;ve built."
          description="Side projects and product work I want to put my name on. More on the way."
        />
        <div className="grid items-start gap-8">
          {projects.map((project, idx) => (
            <Reveal key={project.slug} delay={idx * 0.08} y={20}>
              {/* Gentle parallax depth alternating between columns. */}
              <Parallax speed={idx % 2 === 0 ? 0.22 : 0.32}>
                <ProjectCard
                  project={project}
                  onOpen={() => setActiveSlug(project.slug)}
                />
              </Parallax>
            </Reveal>
          ))}
        </div>
      </div>

      <ProjectModal
        project={active}
        open={active !== null}
        onOpenChange={(open) => {
          if (!open) setActiveSlug(null);
        }}
      />
    </section>
  );
}
