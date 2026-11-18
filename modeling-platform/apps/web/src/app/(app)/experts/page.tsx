import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Users } from "lucide-react";
import { EmptyState, PageContainer, PageHeader } from "@/components/app/page-header";
import { NewExpertButton } from "@/components/experts/new-expert-button";
import { ProjectsPanel } from "@/components/experts/projects-panel";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { listExperts, listProjects } from "@/server/experts";
import { requireUser } from "@/server/session";
import { colorSlot, initials, relativeTime } from "@/lib/format";

export const metadata: Metadata = { title: "Eksperter" };

export default async function ExpertsPage() {
  const user = await requireUser();
  const [experts, projects] = await Promise.all([listExperts(user.id), listProjects(user.id)]);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Modeller"
        title="Eksperter"
        description="De personer, du modellerer. Hver ekspert samler analyser på tværs af sessioner til én profil."
        actions={<NewExpertButton projects={projects.map((p) => ({ id: p.id, name: p.name }))} />}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        {experts.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Ingen eksperter endnu"
            description="Opret en ekspert — fx en topsælger, en coach eller en atlet — og knyt interviews til personen."
          />
        ) : (
          <div className="grid content-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {experts.map((e) => (
              <Link key={e.id} href={`/experts/${e.id}`} className="group">
                <Card className="h-full p-5 transition group-hover:-translate-y-0.5 group-hover:border-primary/30 group-hover:shadow-md">
                  <div className="flex items-start gap-3">
                    <span
                      className="flex size-12 shrink-0 items-center justify-center rounded-2xl text-sm font-bold text-white shadow-sm"
                      style={{ background: `var(--series-${colorSlot(e.id)})` }}
                    >
                      {initials(e.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[17px] font-bold tracking-[-0.01em]">{e.name}</span>
                        {e.isSelf && <Badge tone="primary" className="shrink-0">Dig</Badge>}
                      </div>
                      <div className="truncate text-sm text-muted-foreground">{e.role || "Ingen rolle angivet"}</div>
                    </div>
                    <ArrowUpRight className="size-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                  </div>
                  {e.description && <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{e.description}</p>}
                  <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                    <span>
                      <span className="font-semibold text-foreground">{e.analysisCount}</span> {e.analysisCount === 1 ? "analyse" : "analyser"}
                    </span>
                    <span>{e.lastAnalysisAt ? `Senest ${relativeTime(e.lastAnalysisAt)}` : e.projectName ?? "—"}</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
        <div>
          <ProjectsPanel projects={projects.map((p) => ({ id: p.id, name: p.name, analysisCount: p.analysisCount }))} />
        </div>
      </div>
    </PageContainer>
  );
}
