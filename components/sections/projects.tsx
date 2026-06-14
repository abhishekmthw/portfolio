"use client";

import Link from "next/link";
import { ArrowUpRight, FileText, Github, Folder } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/section-heading";
import { Reveal } from "@/components/motion/reveal";
import { Parallax } from "@/components/motion/parallax";
import { HoverCard } from "@/components/motion/hover-card";
import { projects, type Project } from "@/data/projects";

const statusLabel: Record<Project["status"], string> = {
  "in-development": "In development",
  live: "Live",
  archived: "Archived",
};

const statusDot: Record<Project["status"], string> = {
  "in-development": "bg-amber-400",
  live: "bg-emerald-400",
  archived: "bg-muted-foreground",
};

function ProjectCard({ project }: { project: Project }) {
  const hasLinks =
    project.links?.live || project.links?.repo || project.links?.case_study;

  return (
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
          {project.description}
        </p>

        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {project.highlights.map((h, i) => (
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

        <div className="mt-auto flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {project.stack.map((s) => (
              <Badge key={s} variant="muted" className="font-mono">
                {s}
              </Badge>
            ))}
          </div>

          {hasLinks && (
            <div className="flex flex-wrap items-center gap-2 pt-2">
              {project.links?.live && (
                <Button asChild size="sm">
                  <Link
                    href={project.links.live}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Visit
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              )}
              {project.links?.repo && (
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={project.links.repo}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Github className="h-3.5 w-3.5" />
                    Source
                  </Link>
                </Button>
              )}
              {project.links?.case_study && (
                <Button asChild size="sm" variant="ghost">
                  <Link href={project.links.case_study}>
                    <FileText className="h-3.5 w-3.5" />
                    Case study
                  </Link>
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </HoverCard>
  );
}

export function Projects() {
  return (
    <section id="projects" className="relative scroll-mt-24 px-6 py-24 sm:px-10 lg:px-16 lg:py-36">
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
              <ProjectCard project={project} />
            </Parallax>
          </Reveal>
        ))}
      </div>
      </div>
    </section>
  );
}
