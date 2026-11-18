import Link from "next/link";
import { ArrowRight, Fingerprint, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AutoRefresh } from "@/components/beliefs/match-actions";
import { getAnalysisModeling } from "@/server/modeling";
import { RerunModelButton } from "./model-actions";
import { ModelGlance, SourceBadge } from "./model-parts";

/**
 * Rapportens felt for Gustavs modellering: kernen, millimeteren, første træk
 * og præcisionen fra det kort, der blev bygget, da analysen var færdig.
 */
export async function AnalysisModelPanel({ userId, analysisId }: { userId: string; analysisId: string }) {
  const data = await getAnalysisModeling(userId, analysisId);
  const map = data.map;
  const active = map?.status === "pending" || map?.status === "running";
  const done = map?.status === "done" && map.result;
  const name = data.person?.isSelf ? "dig" : (data.person?.name ?? "personen");

  return (
    <Card id="modeling_map" className="mt-4 scroll-mt-6 overflow-hidden">
      <AutoRefresh active={active} doneMessage="Modelleringskortet er klar" />
      <header className="flex flex-col gap-4 border-b p-6 sm:flex-row sm:items-start sm:justify-between sm:p-8">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-secondary">
            <Fingerprint className="size-5 text-secondary-foreground" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl">Modelleringskort</h2>
              {done && <SourceBadge source={map.source} />}
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground text-pretty">
              Gustavs modellering af {name}
              {done ? ` ud fra ${map.result!.sessions.length === 1 ? "denne samtale" : `alle ${map.result!.sessions.length} samtaler`}` : " ud fra alle samtalerne"}: overbevisninger, mental syntaks og fysiologi oven på de seks behov, med hvert citat slået op ordret.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {done && (
            <Link href={`/modeling?analysis=${analysisId}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-primary hover:bg-secondary">
              Åbn hele kortet <ArrowRight className="size-4" />
            </Link>
          )}
          {!active && data.analysisStatus === "completed" && (
            <RerunModelButton analysisId={analysisId} fresh={!map} label={map ? "Modellér igen" : `Modellér ${name}`} variant={map ? "ghost" : "default"} />
          )}
        </div>
      </header>

      {active ? (
        <div className="p-6 sm:p-8" aria-live="polite">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Loader2 className="size-4 animate-spin text-primary" /> Modellerer {name} ud fra alle samtalerne og slår hvert citat op …
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        </div>
      ) : done ? (
        <div className="space-y-4 p-6 sm:p-8">
          {map.result!.map.core && <p className="max-w-4xl font-display text-xl font-semibold leading-snug text-balance">{map.result!.map.core}</p>}
          <ModelGlance r={map.result!} compact />
          {map.note && <p className="text-xs text-muted-foreground">{map.note}</p>}
        </div>
      ) : map?.status === "failed" ? (
        <p className="p-6 text-sm text-muted-foreground sm:p-8">Modelleringen fejlede: {map.note || "ukendt fejl"}. Prøv igen.</p>
      ) : (
        <p className="p-6 text-sm text-muted-foreground sm:p-8">Der er ikke bygget et modelleringskort for denne analyse endnu.</p>
      )}
    </Card>
  );
}
