import type { Metadata } from "next";
import Link from "next/link";
import { Library, Sparkles, Users } from "lucide-react";
import { getCategory } from "@bm/core";
import { EmptyState, PageContainer, PageHeader } from "@/components/app/page-header";
import { DeletePatternButton, RemoveExampleButton, SaveSuggestionButton } from "@/components/patterns/pattern-actions";
import { CategoryIcon } from "@/components/report/category-icon";
import { Quote } from "@/components/report/report-blocks";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getPatternSuggestions, listPatterns } from "@/server/patterns";
import { requireUser } from "@/server/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Mønsterbibliotek" };

export default async function PatternsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const tab = (await searchParams).tab === "forslag" ? "forslag" : "bibliotek";
  const [patterns, suggestions] = await Promise.all([listPatterns(user.id), getPatternSuggestions(user.id)]);
  const savedTitles = new Set(patterns.map((p) => p.title));

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Mønsterbibliotek"
        title="Fælles mønstre på tværs af eksperter"
        description="Kuratér de strategier, overbevisninger og filtre, der går igen hos dine bedste modeller — og brug dem i coaching og træning."
      />
      <div className="mb-6 inline-flex h-11 items-center gap-1 rounded-xl bg-muted p-1">
        {[
          { key: "bibliotek", label: `Bibliotek (${patterns.length})`, icon: Library },
          { key: "forslag", label: `Automatiske forslag (${suggestions.length})`, icon: Sparkles },
        ].map((t) => (
          <Link
            key={t.key}
            href={t.key === "bibliotek" ? "/patterns" : "/patterns?tab=forslag"}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold text-muted-foreground transition",
              tab === t.key && "bg-card text-foreground shadow-sm",
            )}
          >
            <t.icon className="size-4" /> {t.label}
          </Link>
        ))}
      </div>

      {tab === "bibliotek" ? (
        patterns.length === 0 ? (
          <EmptyState
            icon={Library}
            title="Biblioteket er tomt"
            description="Gem fund direkte fra en rapport (bogmærke-ikonet på hvert fund), eller gem et af de automatiske forslag."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {patterns.map((p) => {
              const cat = getCategory(p.category);
              return (
                <Card key={p.id} className="flex flex-col p-5">
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
                      <CategoryIcon name={cat?.icon ?? "sparkles"} className="size-5 text-primary" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{cat?.title ?? p.category}</div>
                      <h3 className="mt-0.5 text-[17px] leading-snug tracking-[-0.01em]">{p.title}</h3>
                    </div>
                    <DeletePatternButton id={p.id} />
                  </div>
                  {p.description && <p className="mt-3 text-sm text-muted-foreground text-pretty">{p.description}</p>}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge tone="primary">
                      <Users /> {p.expertCount} {p.expertCount === 1 ? "ekspert" : "eksperter"}
                    </Badge>
                    {p.tags.map((t) => (
                      <Badge key={t} tone="outline">
                        #{t}
                      </Badge>
                    ))}
                  </div>
                  <ul className="mt-4 space-y-2 border-t pt-4">
                    {p.examples.map((ex) => (
                      <li key={ex.id} className="group rounded-lg bg-muted/40 p-3 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium text-pretty">{ex.excerpt.label}</div>
                            <Link href={`/analyses/${ex.analysisId}`} className="text-xs text-muted-foreground hover:text-primary">
                              {ex.expertName ?? "Ingen ekspert"} · {ex.analysisTitle}
                            </Link>
                          </div>
                          <RemoveExampleButton patternId={p.id} exampleId={ex.id} />
                        </div>
                        {ex.excerpt.quotes?.[0] && <Quote text={ex.excerpt.quotes[0]} className="mt-2 text-[13px]" />}
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
          </div>
        )
      ) : suggestions.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Ingen fælles mønstre endnu"
          description="Forslag dukker op, når mindst to forskellige eksperter deler en strategi-sekvens, et meta-program, en værdi, et dominerende behov eller en beslægtet overbevisning."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {suggestions.map((s) => {
            const cat = getCategory(s.category);
            return (
              <Card key={s.key} className="p-5">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent">
                    <CategoryIcon name={cat?.icon ?? "sparkles"} className="size-5 text-accent-foreground" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{cat?.title}</div>
                    <h3 className="mt-0.5 text-[17px] leading-snug tracking-[-0.01em]">{s.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <Badge tone="primary">
                    <Users /> {s.expertCount} eksperter · {s.occurrences.length} forekomster
                  </Badge>
                  <SaveSuggestionButton suggestion={s} saved={savedTitles.has(s.title.slice(0, 200))} />
                </div>
                <ul className="mt-4 space-y-1.5 border-t pt-3 text-sm">
                  {s.occurrences.slice(0, 5).map((o, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="shrink-0 font-semibold">{o.expert}:</span>
                      <Link href={`/analyses/${o.analysisId}`} className="min-w-0 truncate text-muted-foreground hover:text-primary">
                        {o.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
