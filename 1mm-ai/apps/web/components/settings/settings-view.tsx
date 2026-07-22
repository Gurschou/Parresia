"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SettingsView() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [saveTranscripts, setSaveTranscripts] = useState(true);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/preferences");
      if (!response.ok) return;
      const body = (await response.json()) as {
        preferences: { displayName: string | null; saveVoiceTranscripts: boolean };
      };
      setDisplayName(body.preferences.displayName ?? "");
      setSaveTranscripts(body.preferences.saveVoiceTranscripts);
    })();
  }, []);

  async function save() {
    setError(null);
    const response = await fetch("/api/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: displayName.trim() || undefined,
        saveVoiceTranscripts: saveTranscripts,
      }),
    });
    if (!response.ok) {
      setError("Kunne ikke gemme indstillingerne.");
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2_000);
  }

  async function deleteAccount() {
    const confirmed = window.confirm(
      "Slet din konto permanent? Alle samtaler, beskeder og minder slettes. Dette kan ikke fortrydes.",
    );
    if (!confirmed) return;
    setDeleting(true);
    try {
      const response = await fetch("/api/account", { method: "DELETE" });
      if (response.ok) {
        router.push("/login");
        router.refresh();
      } else {
        setError("Kontoen kunne ikke slettes. Prøv igen.");
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 pt-16 md:p-8 md:pt-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-xl font-semibold">Indstillinger</h1>

        <section className="mt-6 rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-medium">Profil</h2>
          <label htmlFor="display-name" className="mt-3 block text-sm text-text-secondary">
            Navn
          </label>
          <Input
            id="display-name"
            className="mt-1"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={100}
          />
        </section>

        <section className="mt-4 rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-medium">Privatliv</h2>
          <div className="mt-3 flex items-center justify-between">
            <div>
              <p className="text-sm">Gem transskriptioner fra stemmesamtaler</p>
              <p className="text-xs text-text-secondary">
                Rå lyd gemmes aldrig. Uden dette gemmes stemmesamtaler slet ikke.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={saveTranscripts}
              aria-label="Gem transskriptioner"
              onClick={() => setSaveTranscripts((v) => !v)}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                saveTranscripts ? "bg-primary" : "bg-border"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                  saveTranscripts ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </section>

        <div className="mt-4 flex items-center gap-3">
          <Button onClick={save}>Gem indstillinger</Button>
          {saved && (
            <span role="status" className="text-sm text-success">
              Gemt!
            </span>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}

        <section className="mt-8 rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-medium">Dine data</h2>
          <p className="mt-1 text-xs text-text-secondary">
            Download alle dine data som JSON, eller slet din konto permanent.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => window.open("/api/account/export", "_blank")}>
              <Download className="h-4 w-4" aria-hidden />
              Eksportér data
            </Button>
            <Button variant="danger" onClick={deleteAccount} disabled={deleting}>
              <Trash2 className="h-4 w-4" aria-hidden />
              {deleting ? "Sletter…" : "Slet konto"}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
