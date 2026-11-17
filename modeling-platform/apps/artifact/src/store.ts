import * as React from "react";
import { DEMO_TRANSCRIPTS, countVakogPredicates, type AnalysisResult, type LexiconCounts } from "./lib";
import { EXAMPLE_RESULTS, EXAMPLE_SOURCES } from "./examples";
import { useCap, type Db } from "./runtime";

export interface StoredAnalysis {
  id: string;
  title: string;
  expertName: string;
  domain: string;
  goal: string;
  sessionDate: string;
  createdAt: string;
  transcript: string;
  result: AnalysisResult;
  meta: {
    provider: "claude" | "demo" | "eksempel";
    modelTier?: string;
    durationMs?: number;
    repaired?: boolean;
    fixes?: number;
    lexicon?: LexiconCounts;
  };
  example?: boolean;
}

export interface PatternExample {
  analysisId: string;
  analysisTitle: string;
  expertName: string;
  label: string;
  detail?: string;
  quotes?: string[];
}

export interface StoredPattern {
  id: string;
  title: string;
  category: string;
  description: string;
  tags: string[];
  examples: PatternExample[];
  createdAt: string;
}

export type Backend = "loading" | "db" | "local" | "memory";

const LOCAL_KEY = "parresia-modeling-v1";
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);

/** Eksempel-analyserne (indbygget, skrivebeskyttet, tydeligt markeret). */
export const EXAMPLES: StoredAnalysis[] = EXAMPLE_SOURCES.map(({ id, demoIndex }) => {
  const d = DEMO_TRANSCRIPTS[demoIndex]!;
  const date = daysAgo(d.daysAgo);
  return {
    id: `ex-${id}`,
    title: d.title,
    expertName: d.expert,
    domain: d.role,
    goal: "",
    sessionDate: date.toISOString().slice(0, 10),
    createdAt: date.toISOString(),
    transcript: d.transcript,
    result: EXAMPLE_RESULTS[id]!,
    meta: { provider: "eksempel", lexicon: countVakogPredicates(d.transcript) },
    example: true,
  };
});

function readLocal(): { analyses: StoredAnalysis[]; patterns: StoredPattern[] } {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { analyses: p.analyses ?? [], patterns: p.patterns ?? [] };
    }
  } catch {
    /* blokeret lager: tom start */
  }
  return { analyses: [], patterns: [] };
}
function writeLocal(analyses: StoredAnalysis[], patterns: StoredPattern[]): boolean {
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify({ analyses, patterns }));
    return true;
  } catch {
    return false;
  }
}

const byDateDesc = (a: StoredAnalysis, b: StoredAnalysis) => (b.sessionDate || b.createdAt).localeCompare(a.sessionDate || a.createdAt) || b.createdAt.localeCompare(a.createdAt);

/**
 * Lagring: brugerens egne analyser og mønstre gemmes privat i artifactets
 * db (data/users/<id>/…), ellers i browserens lager, ellers kun i hukommelsen.
 */
export function useStore() {
  const [backend, setBackend] = React.useState<Backend>("loading");
  const [own, setOwn] = React.useState<StoredAnalysis[]>([]);
  const [patterns, setPatterns] = React.useState<StoredPattern[]>([]);
  const [stale, setStale] = React.useState(false);
  const ref = React.useRef<{ db: Db; uid: string } | null>(null);

  React.useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => setStale(true), 10000);
    (async () => {
      const [db, user] = await Promise.all([useCap("db"), useCap("user")]);
      const uid = user ? await user.id().catch(() => null) : null;
      if (cancelled) return;
      if (db && uid) {
        ref.current = { db, uid };
        setBackend("db");
        unsub = db.collection(`data/users/${uid}`).onSnapshot(
          (snap) => {
            if (!snap.metadata.fromCache) {
              window.clearTimeout(timer);
              setStale(false);
            }
            const a: StoredAnalysis[] = [];
            const p: StoredPattern[] = [];
            for (const d of snap.docs) {
              const v = d.data() as Record<string, unknown> | undefined;
              if (!v) continue;
              if (v.kind === "analysis") a.push(v.value as StoredAnalysis);
              else if (v.kind === "pattern") p.push(v.value as StoredPattern);
            }
            setOwn(a);
            setPatterns(p.sort((x, y) => y.createdAt.localeCompare(x.createdAt)));
          },
          () => {
            window.clearTimeout(timer);
            ref.current = null;
            const l = readLocal();
            setOwn(l.analyses);
            setPatterns(l.patterns);
            setBackend("local");
          },
        );
      } else {
        window.clearTimeout(timer);
        const l = readLocal();
        setOwn(l.analyses);
        setPatterns(l.patterns);
        setBackend(writeLocal(l.analyses, l.patterns) ? "local" : "memory");
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      unsub?.();
    };
  }, []);

  const persistLocal = React.useCallback((a: StoredAnalysis[], p: StoredPattern[]) => {
    if (!ref.current) writeLocal(a, p);
  }, []);

  const saveAnalysis = React.useCallback(
    async (x: StoredAnalysis) => {
      if (ref.current) {
        const body = JSON.stringify(x);
        // Et dokument må højst fylde 256 KiB: forkort transskriptet i lageret, hvis nødvendigt.
        const value = body.length > 240_000 ? { ...x, transcript: x.transcript.slice(0, 150_000) + "\n\n[… forkortet ved lagring]" } : x;
        await ref.current.db.collection(`data/users/${ref.current.uid}`).doc(`a-${x.id}`).set({ kind: "analysis", value: JSON.parse(JSON.stringify(value)) });
      } else {
        setOwn((cur) => {
          const next = [x, ...cur.filter((c) => c.id !== x.id)];
          persistLocal(next, patterns);
          return next;
        });
      }
    },
    [patterns, persistLocal],
  );

  const deleteAnalysis = React.useCallback(
    async (id: string) => {
      if (ref.current) await ref.current.db.collection(`data/users/${ref.current.uid}`).doc(`a-${id}`).delete();
      else
        setOwn((cur) => {
          const next = cur.filter((c) => c.id !== id);
          persistLocal(next, patterns);
          return next;
        });
    },
    [patterns, persistLocal],
  );

  const savePattern = React.useCallback(
    async (x: StoredPattern) => {
      if (ref.current) await ref.current.db.collection(`data/users/${ref.current.uid}`).doc(`p-${x.id}`).set({ kind: "pattern", value: JSON.parse(JSON.stringify(x)) });
      else
        setPatterns((cur) => {
          const next = [x, ...cur.filter((c) => c.id !== x.id)];
          persistLocal(own, next);
          return next;
        });
    },
    [own, persistLocal],
  );

  const deletePattern = React.useCallback(
    async (id: string) => {
      if (ref.current) await ref.current.db.collection(`data/users/${ref.current.uid}`).doc(`p-${id}`).delete();
      else
        setPatterns((cur) => {
          const next = cur.filter((c) => c.id !== id);
          persistLocal(own, next);
          return next;
        });
    },
    [own, persistLocal],
  );

  const analyses = React.useMemo(() => [...own, ...EXAMPLES].sort(byDateDesc), [own]);
  return { backend, stale, analyses, own, patterns, saveAnalysis, deleteAnalysis, savePattern, deletePattern };
}

export type Store = ReturnType<typeof useStore>;
