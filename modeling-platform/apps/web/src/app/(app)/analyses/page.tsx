import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { AnalysesTable } from "@/components/analysis/analyses-table";
import { EmptyState, PageContainer, PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { ANALYSIS_STATUSES } from "@/db/schema";
import { listAnalyses } from "@/server/analyses";
import { listExperts, listProjects } from "@/server/experts";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Analyser" };

export default async function AnalysesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [rows, experts, projects] = await Promise.all([
    listAnalyses(user.id, {
      expertId: sp.expertId,
      projectId: sp.projectId,
      status: ANALYSIS_STATUSES.find((s) => s === sp.status),
    }),
    listExperts(user.id),
    listProjects(user.id),
  ]);
  const filtered = !!(sp.expertId || sp.projectId || sp.status);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Historik"
        title="Analyser"
        description="Alle dine transskript- og lydanalyser. Vælg 2-4 færdige analyser for at sammenligne dem side om side."
        actions={
          <Button asChild>
            <Link href="/analyses/new">
              <Plus /> Ny analyse
            </Link>
          </Button>
        }
      />
      {rows.length === 0 && !filtered ? (
        <EmptyState
          icon={FileText}
          title="Ingen analyser endnu"
          description="Start med et interview eller en optagelse af en person, hvis resultater du vil forstå og kopiere."
          action={
            <Button asChild>
              <Link href="/analyses/new">Start din første analyse</Link>
            </Button>
          }
        />
      ) : (
        <AnalysesTable
          rows={rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
          experts={experts.map((e) => ({ id: e.id, name: e.name }))}
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        />
      )}
    </PageContainer>
  );
}
