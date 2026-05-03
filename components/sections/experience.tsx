import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeading } from "@/components/section-heading";
import { experience } from "@/data/experience";

export function Experience() {
  return (
    <section id="experience" className="container scroll-mt-20 py-24">
      <SectionHeading
        eyebrow="Experience"
        title="Where I&rsquo;ve worked."
        description="Two years across product teams in India and the UK — building, migrating, and shipping."
      />

      <div className="relative">
        <div className="absolute left-4 top-2 bottom-2 hidden w-px bg-border md:block" />
        <div className="flex flex-col gap-6">
          {experience.map((job, idx) => (
            <div key={idx} className="relative md:pl-12">
              <span className="absolute left-[10px] top-7 hidden h-2.5 w-2.5 rounded-full bg-brand ring-4 ring-background md:block" />
              <Card className="bg-card/40 backdrop-blur">
                <CardContent className="p-6">
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <h3 className="text-lg font-semibold tracking-tight">
                        {job.role}
                        <span className="text-muted-foreground"> @ </span>
                        <span className="text-brand">{job.company}</span>
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {job.location}
                        {job.remote && (
                          <span className="text-muted-foreground/70">
                            {" "}
                            · Remote
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {job.period}
                      </span>
                      {job.current && (
                        <Badge variant="brand" className="border-brand/40">
                          Current
                        </Badge>
                      )}
                    </div>
                  </div>
                  <ul className="mt-2 space-y-2 text-sm text-muted-foreground sm:text-base">
                    {job.bullets.map((b, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand/70" />
                        <span className="leading-relaxed">{b}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
