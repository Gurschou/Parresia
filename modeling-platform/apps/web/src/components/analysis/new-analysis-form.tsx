"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  AudioLines,
  FileAudio,
  FileText,
  FileUp,
  Loader2,
  Plus,
  Sparkles,
  Type,
  UploadCloud,
  Video,
  X,
} from "lucide-react";
import { isTextTranscriptFile, normalizeTranscriptFile, TEXT_EXTENSIONS } from "@bm/core/text-formats";
import { SAMPLE_TRANSCRIPT } from "@bm/core/sample";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { CreateExpertDialog } from "@/components/experts/create-expert-dialog";

const AUDIO = [".mp3", ".wav", ".m4a", ".aac", ".ogg", ".opus", ".flac"];
const VIDEO = [".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi"];
const NONE = "__none__";

type Mode = "paste" | "file" | "media";
interface Option {
  id: string;
  name: string;
  role?: string;
}

const ext = (n: string) => n.slice(n.lastIndexOf(".")).toLowerCase();
const fmtBytes = (b: number) => (b > 1024 * 1024 ? `${formatNumber(b / 1024 / 1024, 1)} MB` : `${formatNumber(b / 1024, 0)} KB`);

function uploadWithProgress(file: File, onProgress: (pct: number) => void): Promise<{ uploadId: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads");
    xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      const body = JSON.parse(xhr.responseText || "{}");
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(body?.error?.message ?? `Upload fejlede (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Netværksfejl under upload"));
    xhr.send(file);
  });
}

export function NewAnalysisForm({
  experts: initialExperts,
  projects,
  defaultExpertId,
}: {
  experts: Option[];
  projects: Option[];
  defaultExpertId?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("paste");
  const [transcript, setTranscript] = useState("");
  const [textFileName, setTextFileName] = useState("");
  const [media, setMedia] = useState<File | null>(null);
  const [experts, setExperts] = useState(initialExperts);
  const [expertId, setExpertId] = useState(defaultExpertId ?? NONE);
  const [projectId, setProjectId] = useState(NONE);
  const [submitting, setSubmitting] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const mediaInput = useRef<HTMLInputElement>(null);

  const words = useMemo(() => (transcript.trim() ? transcript.trim().split(/\s+/).length : 0), [transcript]);
  const ready = mode === "media" ? !!media : transcript.trim().length >= 80;

  const handleTextFile = useCallback(async (file: File) => {
    if (!isTextTranscriptFile(file.name)) {
      toast.error(`Tekstfiler skal være ${TEXT_EXTENSIONS.join(", ")}. Lyd og video uploades under “Lyd / video”.`);
      return;
    }
    const text = normalizeTranscriptFile(file.name, await file.text());
    setTranscript(text);
    setTextFileName(file.name);
    toast.success(`Indlæste ${file.name}`, { description: `${formatNumber(text.length)} tegn` });
  }, []);

  const handleMedia = useCallback((file: File) => {
    const e = ext(file.name);
    if (![...AUDIO, ...VIDEO].includes(e)) {
      toast.error("Filtypen understøttes ikke", { description: `Brug fx ${[...AUDIO.slice(0, 4), ...VIDEO.slice(0, 3)].join(", ")}` });
      return;
    }
    setMedia(file);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (mode === "media") handleMedia(file);
    else {
      setMode("file");
      void handleTextFile(file);
    }
  };

  async function submit(form: FormData) {
    if (!ready || submitting) return;
    setSubmitting(true);
    try {
      let uploadId: string | undefined;
      if (mode === "media" && media) {
        setUploadPct(0);
        uploadId = (await uploadWithProgress(media, setUploadPct)).uploadId;
      }
      const res = await fetch("/api/analyses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: form.get("title"),
          transcript: mode === "media" ? "" : transcript,
          uploadId,
          sourceName: mode === "file" ? textFileName : "",
          expertId: expertId === NONE ? null : expertId,
          projectId: projectId === NONE ? null : projectId,
          sessionDate: form.get("sessionDate") || null,
          context: {
            domain: form.get("domain") || undefined,
            goal: form.get("goal") || undefined,
            interviewer: form.get("interviewer") || undefined,
            notes: form.get("notes") || undefined,
          },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Analysen kunne ikke startes");
      toast.success("Analysen er startet", { description: "Du kan følge fremdriften live." });
      router.push(`/analyses/${body.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Noget gik galt");
      setSubmitting(false);
      setUploadPct(null);
    }
  }

  return (
    <form action={submit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="overflow-hidden">
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/40 px-5 py-4">
            <TabsList>
              <TabsTrigger value="paste">
                <Type /> Indsæt tekst
              </TabsTrigger>
              <TabsTrigger value="file">
                <FileText /> Tekstfil
              </TabsTrigger>
              <TabsTrigger value="media">
                <AudioLines /> Lyd / video
              </TabsTrigger>
            </TabsList>
            {mode !== "media" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTranscript(SAMPLE_TRANSCRIPT);
                  setTextFileName("");
                  setMode("paste");
                }}
              >
                <Sparkles className="text-primary" /> Brug eksempel
              </Button>
            )}
          </div>

          <div
            className="p-5"
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <TabsContent value="paste" className="mt-0">
              <Textarea
                name="transcript"
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder={"Indsæt interviewet her…\n\nInterviewer: Hvad gør du, når …\nEkspert: Det første jeg gør, er …"}
                className={cn("min-h-[420px] resize-y font-mono text-[13px] leading-6", dragging && "ring-[3px] ring-primary/30")}
                aria-label="Transskript"
              />
            </TabsContent>

            <TabsContent value="file" className="mt-0 space-y-4">
              <DropZone
                active={dragging}
                icon={FileUp}
                title={textFileName || "Træk en tekstfil hertil"}
                subtitle={textFileName ? `${formatNumber(transcript.length)} tegn indlæst — du kan redigere nedenfor` : `${TEXT_EXTENSIONS.join(" · ")} (undertekster renses automatisk)`}
                onClick={() => fileInput.current?.click()}
              />
              <input
                ref={fileInput}
                type="file"
                accept={TEXT_EXTENSIONS.join(",")}
                className="hidden"
                onChange={(e) => e.target.files?.[0] && void handleTextFile(e.target.files[0])}
              />
              {transcript && (
                <Textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  className="min-h-[260px] font-mono text-[13px] leading-6"
                  aria-label="Transskript fra fil"
                />
              )}
            </TabsContent>

            <TabsContent value="media" className="mt-0 space-y-4">
              {!media ? (
                <DropZone
                  active={dragging}
                  icon={UploadCloud}
                  title="Træk en lyd- eller videofil hertil"
                  subtitle="mp3 · wav · m4a · mp4 · mov · webm — transskriberes automatisk og analyseres bagefter"
                  onClick={() => mediaInput.current?.click()}
                />
              ) : (
                <div className="flex items-center gap-4 rounded-xl border bg-muted/40 p-4">
                  <span className="flex size-12 items-center justify-center rounded-xl bg-secondary">
                    {VIDEO.includes(ext(media.name)) ? <Video className="size-6 text-primary" /> : <FileAudio className="size-6 text-primary" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{media.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {fmtBytes(media.size)} · {VIDEO.includes(ext(media.name)) ? "Video — lydsporet udtrækkes" : "Lyd"}
                    </div>
                    {uploadPct !== null && (
                      <div className="mt-2 flex items-center gap-3">
                        <Progress value={uploadPct} className="h-1.5" />
                        <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{uploadPct}%</span>
                      </div>
                    )}
                  </div>
                  {!submitting && (
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => setMedia(null)} aria-label="Fjern fil">
                      <X />
                    </Button>
                  )}
                </div>
              )}
              <input
                ref={mediaInput}
                type="file"
                accept={[...AUDIO, ...VIDEO, "audio/*", "video/*"].join(",")}
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleMedia(e.target.files[0])}
              />
              <ol className="grid gap-3 text-sm sm:grid-cols-3">
                {["Upload (streames direkte til serveren)", "Transskribering (Whisper / AssemblyAI / lokal)", "Fuld adfærdsmodel med Claude"].map((s, i) => (
                  <li key={s} className="flex items-start gap-2.5 rounded-xl border bg-card p-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-primary">{i + 1}</span>
                    <span className="text-muted-foreground">{s}</span>
                  </li>
                ))}
              </ol>
            </TabsContent>
          </div>
        </Tabs>
        {mode !== "media" && (
          <div className="flex items-center justify-between border-t px-5 py-3 text-xs text-muted-foreground">
            <span>
              {formatNumber(words)} ord · {formatNumber(transcript.length)} tegn
            </span>
            <span>{transcript.trim().length > 0 && transcript.trim().length < 80 ? "Mindst 80 tegn" : "Talerlinjer som “Navn: …” giver den bedste analyse"}</span>
          </div>
        )}
      </Card>

      <div className="space-y-6">
        <Card className="p-5">
          <h2 className="mb-4 font-sans text-sm font-bold uppercase tracking-wider text-muted-foreground">Model & kontekst</h2>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Model / ekspert</Label>
                <CreateExpertDialog
                  projects={projects}
                  onCreated={(e) => {
                    setExperts((xs) => [...xs, e].sort((a, b) => a.name.localeCompare(b.name, "da")));
                    setExpertId(e.id);
                  }}
                  trigger={
                    <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                      <Plus className="size-3" /> Ny
                    </button>
                  }
                />
              </div>
              <Select value={expertId} onValueChange={setExpertId}>
                <SelectTrigger aria-label="Vælg ekspert">
                  <SelectValue placeholder="Vælg ekspert" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Ingen (ukendt person)</SelectItem>
                  {experts.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                      {e.role ? <span className="text-muted-foreground"> · {e.role}</span> : null}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Projekt</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger aria-label="Vælg projekt">
                  <SelectValue placeholder="Intet projekt" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Intet projekt</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="title">Titel</Label>
                <Input id="title" name="title" placeholder="Fx “Interview om salgsmøder”" />
              </div>
              <div className="col-span-2 space-y-2 sm:col-span-1 lg:col-span-2 xl:col-span-1">
                <Label htmlFor="sessionDate">Sessionsdato</Label>
                <Input id="sessionDate" name="sessionDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
              </div>
              <div className="col-span-2 space-y-2 sm:col-span-1 lg:col-span-2 xl:col-span-1">
                <Label htmlFor="interviewer">Interviewer</Label>
                <Input id="interviewer" name="interviewer" placeholder="Navn i transskriptet" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="domain">Rolle / domæne</Label>
              <Input id="domain" name="domain" placeholder="Fx salgsdirektør, elitesvømmer" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal">Resultat der modelleres</Label>
              <Textarea id="goal" name="goal" className="min-h-16" placeholder="Fx “lukker store B2B-aftaler konsekvent”" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Noter til analysen</Label>
              <Textarea id="notes" name="notes" className="min-h-16" placeholder="Valgfrit: hvad skal analysen være særligt opmærksom på?" />
            </div>
          </div>
        </Card>

        <Button type="submit" size="lg" className="w-full" disabled={!ready || submitting}>
          {submitting ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {submitting ? (uploadPct !== null && uploadPct < 100 ? `Uploader… ${uploadPct}%` : "Starter analyse…") : "Kør analyse"}
          {!submitting && <ArrowRight className="ml-auto" />}
        </Button>
        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          Analysen udtrækker strategier (TOTE), overbevisninger, værdier & 6 Human Needs, meta-programmer, meaning-makers, VAKOG, eye
          accessing cues samt mangler og næste spørgsmål — altid med ordrette citater som belæg.
        </p>
      </div>
    </form>
  );
}

function DropZone({
  icon: Icon,
  title,
  subtitle,
  onClick,
  active,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition",
        "hover:border-primary/50 hover:bg-secondary/40",
        active && "border-primary bg-secondary/60",
      )}
    >
      <span className="flex size-14 items-center justify-center rounded-2xl bg-card shadow-sm ring-1 ring-border transition group-hover:scale-105">
        <Icon className="size-6 text-primary" />
      </span>
      <span className="font-semibold">{title}</span>
      <span className="max-w-md text-sm text-muted-foreground">{subtitle}</span>
      <span className="text-xs font-semibold text-primary">eller klik for at vælge</span>
    </button>
  );
}
