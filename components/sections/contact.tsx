import Link from "next/link";
import { ArrowUpRight, Github, Linkedin, Mail, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/section-heading";
import { profile } from "@/data/profile";

export function Contact() {
  return (
    <section id="contact" className="container scroll-mt-20 py-24">
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-brand/15 via-brand/5 to-transparent p-8 sm:p-12">
        <div className="bg-grid bg-radial-fade pointer-events-none absolute inset-0 opacity-30" />
        <div className="relative">
          <SectionHeading
            eyebrow="Contact"
            title="Let&rsquo;s build something."
            description="Open to full-time roles, freelance work, and interesting collaborations. Drop a line — I read every email."
            align="center"
          />
          <div className="mx-auto flex max-w-xl flex-col items-center gap-4">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href={`mailto:${profile.email}`}>
                <Mail className="h-4 w-4" />
                {profile.email}
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
            <Link
              href={`tel:${profile.phone.replace(/\s+/g, "")}`}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <Phone className="h-4 w-4" />
              {profile.phone}
            </Link>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Link
                href={profile.github}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
              >
                <Github className="h-4 w-4" />
                github.com/abhishekmthw
              </Link>
              <span aria-hidden>·</span>
              <Link
                href={profile.linkedin}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
              >
                <Linkedin className="h-4 w-4" />
                linkedin.com/in/abhishekmthw
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
