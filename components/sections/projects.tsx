"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, Github } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeading } from "@/components/section-heading";
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

export function Projects() {
  return (
    <section id="projects" className="container scroll-mt-20 py-24">
      <SectionHeading
        eyebrow="Projects"
        title="Things I&rsquo;ve built."
        description="Side projects and product work I want to put my name on. More on the way."
      />
      <div className="grid gap-6 md:grid-cols-2">
        {projects.map((project, idx) => (
          <motion.div
            key={project.slug}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.4, delay: idx * 0.05 }}
          >
            <Card className="group relative h-full overflow-hidden bg-card/40 backdrop-blur transition-colors hover:bg-card/70">
              <div
                className={cn(
                  "pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br opacity-60 transition-opacity group-hover:opacity-100",
                  project.accent ?? "from-brand/15 via-brand/5 to-transparent"
                )}
              />
              <CardContent className="flex h-full flex-col gap-5 p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-2xl font-semibold tracking-tight">
                      {project.name}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {project.tagline}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-2.5 py-1 text-xs text-muted-foreground">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        statusDot[project.status]
                      )}
                    />
                    {statusLabel[project.status]}
                  </span>
                </div>

                <p className="text-sm leading-relaxed text-muted-foreground">
                  {project.description}
                </p>

                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {project.highlights.map((h, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto flex flex-col gap-4">
                  <div className="flex flex-wrap gap-2">
                    {project.stack.map((s) => (
                      <Badge key={s} variant="muted">
                        {s}
                      </Badge>
                    ))}
                  </div>

                  {(project.links?.live ||
                    project.links?.repo ||
                    project.links?.case_study) && (
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
                            Case study
                          </Link>
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
