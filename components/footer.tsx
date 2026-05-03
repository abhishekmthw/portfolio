import Link from "next/link";
import { Github, Linkedin, Mail } from "lucide-react";

import { profile } from "@/data/profile";

export function Footer() {
  return (
    <footer className="border-t border-border/60 py-10">
      <div className="container flex flex-col items-center justify-between gap-4 sm:flex-row">
        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} {profile.name}. Built with Next.js and
          Tailwind.
        </p>
        <div className="flex items-center gap-3 text-muted-foreground">
          <Link
            aria-label="GitHub"
            href={profile.github}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-foreground"
          >
            <Github className="h-4 w-4" />
          </Link>
          <Link
            aria-label="LinkedIn"
            href={profile.linkedin}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-foreground"
          >
            <Linkedin className="h-4 w-4" />
          </Link>
          <Link
            aria-label="Email"
            href={`mailto:${profile.email}`}
            className="transition-colors hover:text-foreground"
          >
            <Mail className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </footer>
  );
}
