import * as React from "react";
import { DEMO_TRANSCRIPTS, countVakogPredicates, type AnalysisResult, type BeliefMatch, type LexiconCounts, type MatchSource, type ModelingMapResult } from "./lib";
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

/** Overbevisnings-match for én analyse (kørt, da analysen blev gemt, eller senere). */
export interface StoredMatchRun {
  analysisId: string;
  source: MatchSource;
  summary: string;
  note: string;
  personCount: number;
  matches: BeliefMatch[];
  createdAt: string;
}

/** Gustavs modelleringskort for én analyse (bygget af alle personens samtaler). */
export interface StoredModelRun {
  analysisId: string;
  personKey: string;
  source: "claude" | "heuristic";
  note: string;
  result: ModelingMapResult;
  createdAt: string;
}

export interface Settings {
  /** Navnet på den person i biblioteket, der er brugeren selv ("Det er mig"). */
  selfName: string;
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

interface LocalData {
  analyses: StoredAnalysis[];
  patterns: StoredPattern[];
  matches: StoredMatchRun[];
  settings: Settings;
  models: StoredModelRun[];
}
const EMPTY_SETTINGS: Settings = { selfName: "" };

function readLocal(): LocalData {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { analyses: p.analyses ?? [], patterns: p.patterns ?? [], matches: p.matches ?? [], models: p.models ?? [], settings: { ...EMPTY_SETTINGS, ...p.settings } };
    }
  } catch {
    /* blokeret lager: tom start */
  }
  return { analyses: [], patterns: [], matches: [], models: [], settings: EMPTY_SETTINGS };
}
function writeLocal(d: LocalData): boolean {
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(d));
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
  const [matchRuns, setMatchRuns] = React.useState<StoredMatchRun[]>([]);
  const [modelRuns, setModelRuns] = React.useState<StoredModelRun[]>([]);
  const [settings, setSettings] = React.useState<Settings>(EMPTY_SETTINGS);
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
            const m: StoredMatchRun[] = [];
            const mm: StoredModelRun[] = [];
            let st = EMPTY_SETTINGS;
            for (const d of snap.docs) {
              const v = d.data() as Record<string, unknown> | undefined;
              if (!v) continue;
              if (v.kind === "analysis") a.push(v.value as StoredAnalysis);
              else if (v.kind === "pattern") p.push(v.value as StoredPattern);
              else if (v.kind === "match") m.push(v.value as StoredMatchRun);
              else if (v.kind === "model") mm.push(v.value as StoredModelRun);
              else if (v.kind === "settings") st = { ...EMPTY_SETTINGS, ...(v.value as Settings) };
            }
            setOwn(a);
            setPatterns(p.sort((x, y) => y.createdAt.localeCompare(x.createdAt)));
            setMatchRuns(m);
            setModelRuns(mm);
            setSettings(st);
          },
          () => {
            window.clearTimeout(timer);
            ref.current = null;
            const l = readLocal();
            setOwn(l.analyses);
            setPatterns(l.patterns);
            setMatchRuns(l.matches);
            setModelRuns(l.models);
            setSettings(l.settings);
            setBackend("local");
          },
        );
      } else {
        window.clearTimeout(timer);
        const l = readLocal();
        setOwn(l.analyses);
        setPatterns(l.patterns);
        setMatchRuns(l.matches);
        setModelRuns(l.models);
        setSettings(l.settings);
        setBackend(writeLocal(l) ? "local" : "memory");
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      unsub?.();
    };
  }, []);

  // Seneste lokale tilstand, så hver skrivning gemmer det hele (kun uden db).
  const local = React.useRef<LocalData>({ analyses: [], patterns: [], matches: [], models: [], settings: EMPTY_SETTINGS });
  local.current = { analyses: own, patterns, matches: matchRuns, models: modelRuns, settings };
  const persistLocal = React.useCallback((patch: Partial<LocalData>) => {
    local.current = { ...local.current, ...patch };
    if (!ref.current) writeLocal(local.current);
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
          persistLocal({ analyses: next });
          return next;
        });
      }
    },
    [persistLocal],
  );

  const deleteAnalysis = React.useCallback(
    async (id: string) => {
      if (ref.current) {
        await ref.current.db.collection(`data/users/${ref.current.uid}`).doc(`a-${id}`).delete();
        await ref.current.db.collection(`data/users/${ref.current.uid}`).doc(`m-${id}`).delete().catch(() => {});
        await ref.current.db.collection(`data/users/${ref.current.uid}`).doc(`mm-${id}`).delete().catch(() => {});
      } else {
        setOwn((cur) => {
          const next = cur.filter((c) => c.id !== id);
          persistLocal({ analyses: next });
          return next;
        });
        setMatchRuns((cur) => {
          const next = cur.filter((m) => m.analysisId !== id);
          persistLocal({ matches: next });
          return next;
        });
        setModelRuns((cur) => {
          const next = cur.filter((m) => m.analysisId !== id);
          persistLocal({ models: next });
          return next;
        });
      }
    },
    [persistLocal],
  );

  const savePattern = React.useCallback(
    async (x: StoredPattern) => {
      if (ref.current) await ref.current.db.collection(`data/users/${ref.current.uid}`).doc(`p-${x.id}`).set({ kind: "pattern", value: JSON.parse(JSON.stringify(x)) });
      else
        setPatterns((cur) => {
          const next = [x, ...cur.filter((c) => c.id !== x.id)];
          persistLocal({ patterns: next });
          return next;
        });
    },
    [persistLocal],
  );

  const deletePattern = React.useCallback(
    async (id: string) => {
      if (ref.current) await ref.current.db.collection(`data/users/${ref.current.uid}`).doc(`p-${id}`).delete();
      else
        setPatterns((cur) => {
          const next = cur.filter((c) => c.id !== id);
          persistLocal({ patterns: next });
          return next;
        });
    },
    [persistLocal],
  );

  const saveMatchRun = React.useCallback(
    async (x: StoredMatchRun) => {
      if (ref.current) {
        await ref.current.db.collection(`data/users/${ref.current.uid}`).doc(`m-${x.analysisId}`).set({ kind: "match", value: JSON.parse(JSON.stringify(x)) });
      } else {
        setMatchRuns((cur) => {
          const next = [x, ...cur.filter((c) => c.analysisId !== x.analysisId)];
          persistLocal({ matches: next });
          return next;
        });
      }
    },
    [persistLocal],
  );

  const saveModelRun = React.useCallback(
    async (x: StoredModelRun) => {
      if (ref.current) {
        await ref.current.db.collection(`data/users/${ref.current.uid}`).doc(`mm-${x.analysisId}`).set({ kind: "model", value: JSON.parse(JSON.stringify(x)) });
      } else {
        setModelRuns((cur) => {
          const next = [x, ...cur.filter((c) => c.analysisId !== x.analysisId)];
          persistLocal({ models: next });
          return next;
        });
      }
    },
    [persistLocal],
  );

  const saveSettings = React.useCallback(
    async (x: Settings) => {
      if (ref.current) {
        setSettings(x);
        await ref.current.db.collection(`data/users/${ref.current.uid}`).doc("settings").set({ kind: "settings", value: { ...x } });
      } else {
        setSettings(x);
        persistLocal({ settings: x });
      }
    },
    [persistLocal],
  );

  const analyses = React.useMemo(() => [...own, ...EXAMPLES].sort(byDateDesc), [own]);
  return { backend, stale, analyses, own, patterns, matchRuns, modelRuns, settings, saveAnalysis, deleteAnalysis, savePattern, deletePattern, saveMatchRun, saveModelRun, saveSettings };
}

export type Store = ReturnType<typeof useStore>;
