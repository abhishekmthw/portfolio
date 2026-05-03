import { GraduationCap, Award } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { SectionHeading } from "@/components/section-heading";
import { education, accomplishments } from "@/data/education";

export function Education() {
  return (
    <section id="education" className="container scroll-mt-20 py-24">
      <SectionHeading
        eyebrow="Education"
        title="Background."
        description="Formal education and certifications."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          {education.map((e, i) => (
            <Card key={i} className="bg-card/40 backdrop-blur">
              <CardContent className="flex gap-4 p-6">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand">
                  <GraduationCap className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold tracking-tight">
                    {e.qualification}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {e.institution} · {e.location}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {e.period}
                    {e.detail ? ` · ${e.detail}` : ""}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-col gap-4">
          {accomplishments.map((a, i) => (
            <Card key={i} className="bg-card/40 backdrop-blur">
              <CardContent className="p-6">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand">
                    <Award className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold tracking-tight">
                      {a.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">{a.issuer}</p>
                  </div>
                </div>
                <ul className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                  {a.details.map((d, j) => (
                    <li key={j} className="flex gap-2">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
