import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeading } from "@/components/section-heading";
import { skills } from "@/data/skills";

export function Skills() {
  return (
    <section id="skills" className="container scroll-mt-20 py-24">
      <SectionHeading
        eyebrow="Skills"
        title="Tools I reach for."
        description="The stack I use day to day, grouped by where it lives."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {skills.map((group) => (
          <Card
            key={group.category}
            className="bg-card/40 backdrop-blur transition-colors hover:bg-card/60"
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-brand">
                {group.category}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {group.items.map((s) => (
                  <Badge key={s} variant="muted">
                    {s}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
