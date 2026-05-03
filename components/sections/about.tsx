import { Languages } from "lucide-react";

import { SectionHeading } from "@/components/section-heading";
import { profile } from "@/data/profile";

export function About() {
  return (
    <section id="about" className="container scroll-mt-20 py-24">
      <SectionHeading
        eyebrow="About"
        title="A full stack developer who ships."
        description="The tl;dr — I build full stack web applications and the AWS scaffolding around them."
      />
      <div className="grid gap-6 md:grid-cols-2">
        {profile.about.map((p, i) => (
          <p
            key={i}
            className="text-base leading-relaxed text-muted-foreground sm:text-lg"
          >
            {p}
          </p>
        ))}
      </div>
      <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
        <Languages className="h-4 w-4 text-brand" />
        <span>Speaks {profile.spokenLanguages.join(", ")}.</span>
      </div>
    </section>
  );
}
