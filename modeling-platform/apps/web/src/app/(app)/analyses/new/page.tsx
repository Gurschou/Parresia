import type { Metadata } from "next";
import { NewAnalysisForm } from "@/components/analysis/new-analysis-form";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { listExperts, listProjects } from "@/server/experts";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Ny analyse" };

export default async function NewAnalysisPage({ searchParams }: { searchParams: Promise<{ expertId?: string; welcome?: string }> }) {
  const user = await requireUser();
  const { expertId, welcome } = await searchParams;
  const [experts, projects] = await Promise.all([listExperts(user.id), listProjects(user.id)]);

  return (
    <PageContainer>
      <PageHeader
        eyebrow={welcome ? `Velkommen, ${user.name.split(" ")[0]}` : "Ny analyse"}
        title="Hvem vil du modellere i dag?"
        description="Indsæt et transskript, upload en tekstfil eller en lyd/video-optagelse. Analysen kører i baggrunden, og du kan følge den live."
      />
      <NewAnalysisForm
        experts={experts.map((e) => ({ id: e.id, name: e.name, role: e.role }))}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        defaultExpertId={experts.some((e) => e.id === expertId) ? expertId : undefined}
      />
    </PageContainer>
  );
}
