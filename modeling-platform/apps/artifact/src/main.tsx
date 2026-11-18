import * as React from "react";
import { createRoot } from "react-dom/client";
import { BarChart3, Cloud, Columns3, FileText, HardDrive, LayoutGrid, Library, Loader2, Menu, Moon, Sparkles, Sun, Users, X } from "lucide-react";
import { cn } from "./lib";
import { useCap, type DownloadsCap, type SampleFn } from "./runtime";
import { useStore } from "./store";
import { EmptyState, LinkButton, useToast } from "./ui";
import { ReportView } from "./report";
import { AnalysesList, Compare, Dashboard, ExpertProfile, Experts, NewAnalysis, Overview, Patterns } from "./views";
import type { AppCtx } from "./app-ctx";

/* Hash-ruter (kun simple navne): #oversigt, #ny-analyse, #analyser, #analyse-<id>,
   #eksperter, #ekspert-<slug>, #sammenlign, #moenstre, #dashboard */
type Route =
  | { name: "oversigt" | "ny-analyse" | "analyser" | "eksperter" | "sammenlign" | "moenstre" | "dashboard" }
  | { name: "analyse"; id: string }
  | { name: "ekspert"; slug: string };

function parseHash(): Route {
  const h = decodeURIComponent(location.hash.replace(/^#/, ""));
  if (h.startsWith("analyse-")) return { name: "analyse", id: h.slice(8) };
  if (h.startsWith("ekspert-")) return { name: "ekspert", slug: h.slice(8) };
  const simple = ["ny-analyse", "analyser", "eksperter", "sammenlign", "moenstre", "dashboard"] as const;
  return { name: (simple as readonly string[]).includes(h) ? (h as (typeof simple)[number]) : "oversigt" };
}

function useRoute(): Route {
  const [route, setRoute] = React.useState(parseHash);
  React.useEffect(() => {
    const on = () => {
      setRoute(parseHash());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

const NAV = [
  { key: "oversigt", label: "Oversigt", icon: LayoutGrid, match: ["oversigt"] },
  { key: "ny-analyse", label: "Ny analyse", icon: Sparkles, match: ["ny-analyse"] },
  { key: "analyser", label: "Analyser", icon: FileText, match: ["analyser", "analyse"] },
  { key: "eksperter", label: "Eksperter", icon: Users, match: ["eksperter", "ekspert"] },
  { key: "sammenlign", label: "Sammenlign", icon: Columns3, match: ["sammenlign"] },
  { key: "moenstre", label: "Mønstre", icon: Library, match: ["moenstre"] },
  { key: "dashboard", label: "Dashboard", icon: BarChart3, match: ["dashboard"] },
] as const;

/** Mærket: en iris med de seks eye accessing-positioner (Vc/Vr, Ac/Ar, K/Ad). */
function Mark({ className }: { className?: string }) {
  const pts: [number, number][] = [
    [6, 7],
    [18, 7],
    [3.6, 12],
    [20.4, 12],
    [6, 17],
    [18, 17],
  ];
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <circle cx="12" cy="12" r="4.6" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.25" fill={`var(--series-${[1, 1, 2, 2, 3, 6][i]})`} />
      ))}
    </svg>
  );
}

function Logo() {
  return (
    <a href="#oversigt" className="flex items-center gap-3 text-sidebar-foreground">
      <span className="flex size-10 items-center justify-center rounded-xl bg-sidebar-accent ring-1 ring-sidebar-border">
        <Mark className="size-7" />
      </span>
      <span className="leading-none">
        <span className="block text-[17px] font-extrabold tracking-[-0.02em]">Parresia</span>
        <span className="mt-1 block text-[10.5px] font-semibold tracking-[0.2em] text-sidebar-muted uppercase">Modeling Studio</span>
      </span>
    </a>
  );
}

type Theme = "light" | "dark" | null;
function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = React.useState<Theme>(() => {
    try {
      const t = window.localStorage.getItem("parresia-theme");
      return t === "light" || t === "dark" ? t : null;
    } catch {
      return null;
    }
  });
  React.useEffect(() => {
    if (theme) document.documentElement.setAttribute("data-theme", theme);
    else document.documentElement.removeAttribute("data-theme");
  }, [theme]);
  const toggle = () => {
    const isDark = theme ? theme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = isDark ? "light" : "dark";
    setTheme(next);
    try {
      window.localStorage.setItem("parresia-theme", next);
    } catch {
      /* ingen lagring: temaet gælder kun denne visning */
    }
  };
  return [theme, toggle];
}

function StorageNote({ backend, stale }: { backend: string; stale: boolean }) {
  const [Icon, text] =
    backend === "db"
      ? stale
        ? [Cloud, "Gemt privat i Claude · synkroniserer…"]
        : [Cloud, "Gemt privat i din Claude-konto"]
      : backend === "local"
        ? [HardDrive, "Gemt i denne browser"]
        : backend === "memory"
          ? [HardDrive, "Gemmes kun, mens siden er åben"]
          : [Loader2, "Forbinder til lageret…"];
  return (
    <div className="flex items-center gap-2 text-xs text-sidebar-muted">
      <Icon className={cn("size-3.5 shrink-0", backend === "loading" && "animate-spin")} /> <span className="min-w-0">{text}</span>
    </div>
  );
}

function App() {
  const route = useRoute();
  const store = useStore();
  const { toast, node: toastNode } = useToast();
  const [theme, toggleTheme] = useTheme();
  const [sample, setSample] = React.useState<SampleFn | null>(null);
  const [downloads, setDownloads] = React.useState<DownloadsCap | null>(null);
  const [capsReady, setCapsReady] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [menuOpen, setMenuOpen] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    void Promise.all([useCap("sample"), useCap("downloads")]).then(([s, d]) => {
      if (!alive) return;
      // sample er en funktion: pak den ind, så React ikke kalder den som en state-opdatering.
      setSample(() => s);
      setDownloads(d);
      setCapsReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => setMenuOpen(false), [route]);

  const ctx: AppCtx = {
    store,
    toast,
    sample,
    capsReady,
    canDownload: !!downloads,
    download: async (filename, data) => {
      if (!downloads) return;
      try {
        await downloads.save({ filename, data });
      } catch (e) {
        const code = (e as { code?: string })?.code;
        if (code === "declined" || code === "cancelled" || code === "aborted") toast("Gemning annulleret", "info");
        else toast("Filen kunne ikke gemmes.", "negative");
      }
    },
    copy: async (text, ok) => {
      try {
        await navigator.clipboard.writeText(text);
        toast(ok, "positive");
      } catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const done = document.execCommand("copy");
        ta.remove();
        toast(done ? ok : "Kunne ikke kopiere — din browser tillader det ikke her.", done ? "positive" : "negative");
      }
    },
  };

  let page: React.ReactNode;
  switch (route.name) {
    case "ny-analyse":
      page = <NewAnalysis ctx={ctx} />;
      break;
    case "analyser":
      page = <AnalysesList ctx={ctx} selected={selected} setSelected={setSelected} />;
      break;
    case "analyse": {
      const a = store.analyses.find((x) => x.id === route.id);
      page = a ? (
        <ReportView key={a.id} ctx={ctx} analysis={a} />
      ) : store.backend === "loading" || (store.backend === "db" && store.stale) ? (
        <div className="flex justify-center py-24">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="gutter mx-auto max-w-3xl py-16">
          <EmptyState icon={FileText} title="Analysen findes ikke" description="Den kan være slettet, eller linket peger på en analyse i en anden konto." action={<LinkButton href="#analyser">Til analyserne</LinkButton>} />
        </div>
      );
      break;
    }
    case "eksperter":
      page = <Experts ctx={ctx} />;
      break;
    case "ekspert":
      page = <ExpertProfile ctx={ctx} expertSlug={route.slug} setSelected={setSelected} />;
      break;
    case "sammenlign":
      page = <Compare ctx={ctx} selected={selected} setSelected={setSelected} />;
      break;
    case "moenstre":
      page = <Patterns ctx={ctx} />;
      break;
    case "dashboard":
      page = <Dashboard ctx={ctx} />;
      break;
    default:
      page = <Overview ctx={ctx} />;
  }

  const isDark = theme ? theme === "dark" : typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const navList = (
    <nav className="flex flex-col gap-1" aria-label="Hovedmenu">
      {NAV.map((n) => {
        const active = (n.match as readonly string[]).includes(route.name);
        return (
          <a
            key={n.key}
            href={`#${n.key}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] font-medium transition",
              active ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            <n.icon className={cn("size-[17px]", active && "text-primary")} style={active ? { color: "color-mix(in oklch, var(--primary) 55%, var(--sidebar-foreground))" } : undefined} /> {n.label}
            {n.key === "analyser" && store.own.length > 0 && <span className="tabular ml-auto font-mono text-[11px] text-sidebar-muted">{store.own.length}</span>}
          </a>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen flex-col gap-9 bg-sidebar px-4 py-6 lg:flex">
        <div className="px-1">
          <Logo />
        </div>
        <div className="flex flex-col gap-2">
          <div className="eyebrow px-3 text-sidebar-muted/70">Arbejdsrum</div>
          {navList}
        </div>
        <div className="mt-auto flex flex-col gap-3 border-t border-sidebar-border px-2 pt-4">
          <StorageNote backend={store.backend} stale={store.stale} />
          <button onClick={toggleTheme} className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-sidebar-muted hover:text-sidebar-foreground">
            {isDark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />} {isDark ? "Lyst tema" : "Mørkt tema"}
          </button>
        </div>
      </aside>

      {/* Topbar (mobil/tablet) */}
      <header className="gutter sticky z-40 flex h-16 items-center justify-between bg-sidebar lg:hidden" style={{ top: "env(safe-area-inset-top, 0px)" }}>
        <Logo />
        <div className="flex items-center gap-1 text-sidebar-foreground">
          <button onClick={toggleTheme} aria-label={isDark ? "Lyst tema" : "Mørkt tema"} className="flex size-10 cursor-pointer items-center justify-center rounded-lg hover:bg-sidebar-accent">
            {isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </button>
          <button onClick={() => setMenuOpen((o) => !o)} aria-label="Menu" aria-expanded={menuOpen} className="flex size-10 cursor-pointer items-center justify-center rounded-lg hover:bg-sidebar-accent">
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </header>
      {menuOpen && (
        <div className="gutter animate-in fixed inset-x-0 z-30 bg-sidebar pt-2 pb-5 shadow-lg lg:hidden" style={{ top: "calc(64px + env(safe-area-inset-top, 0px))" }}>
          {navList}
          <div className="mt-4 border-t border-sidebar-border pt-3">
            <StorageNote backend={store.backend} stale={store.stale} />
          </div>
        </div>
      )}

      <main id="indhold" className="min-w-0 pb-16">
        {page}
      </main>
      {toastNode}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
