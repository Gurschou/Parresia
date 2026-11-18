import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { AnalysisActions } from "@/components/analysis/analysis-actions";
import { AnalysisProgress } from "@/components/analysis/analysis-progress";
import { PageContainer } from "@/components/app/page-header";
import { ReportView } from "@/components/report/report-view";
import { HttpError } from "@/server/http";
import { getAnalysis } from "@/server/analyses";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Analyse" };

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  let analysis;
  try {
    analysis = await getAnalysis(user.id, id);
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) notFound();
    throw err;
  }

  if (analysis.status === "completed" && analysis.result) {
    return <ReportView analysis={{ ...analysis, result: analysis.result }} />;
  }

  return (
    <PageContainer>
      <nav className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/analyses" className="hover:text-foreground">
          Analyser
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="truncate text-foreground">{analysis.title}</span>
      </nav>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl">{analysis.title}</h1>
          {analysis.expert && <p className="mt-1 text-muted-foreground">{analysis.expert.name}</p>}
        </div>
        <AnalysisActions id={analysis.id} title={analysis.title} completed={false} />
      </div>
      <AnalysisProgress
        id={analysis.id}
        hasMedia={analysis.sourceType === "audio" || analysis.sourceType === "video"}
        initial={{
          status: analysis.status,
          progress: analysis.progress,
          stageMessage: analysis.stageMessage,
          errorMessage: analysis.errorMessage,
          errorCode: analysis.errorCode,
        }}
      />
    </PageContainer>
  );
}
