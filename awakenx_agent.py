#!/usr/bin/env python3
"""
AwakenX — laget ovenpå Mistral AI
=================================
Kør AwakenX som selvstændig agent ovenpå Mistrals API med:
  - v3 system-instruktionen (indlæses fra .md-filen)
  - persistent hukommelse pr. bruger (JSON) — agentens stærkeste våben
  - automatisk hukommelses-opdatering efter hver session
  - CLI-chat til test + genbrugelig klasse til app/web-integration

Opsætning:
  1. pip install mistralai
  2. Få en API-nøgle på https://console.mistral.ai (API Keys)
  3. export MISTRAL_API_KEY="din-nøgle"
  4. python awakenx_agent.py

Filen er bygget så samme klasse (AwakenX) kan bruges direkte i en
FastAPI-backend eller mobil-app senere — se eksemplet nederst.
"""

import json
import os
import sys
from datetime import date
from pathlib import Path

from mistralai.client import Mistral

# ── Konfiguration ──────────────────────────────────────────────────────────
MODEL = "mistral-large-latest"          # bedste kvalitet; brug "mistral-small-latest" for lavere pris
MEMORY_DIR = Path("awakenx_memory")     # én JSON-fil pr. bruger
PROMPT_FILE = Path(__file__).parent / "awakenx_mistral_agent_instruktion_v3.md"


def load_system_prompt() -> str:
    """Indlæs v3-instruktionen; alt efter '---' er selve prompten."""
    text = PROMPT_FILE.read_text(encoding="utf-8")
    if "\n---\n" in text:
        text = text.split("\n---\n", 1)[1]
    return text.strip()


# ── Hukommelse ─────────────────────────────────────────────────────────────
class Memory:
    """Persistent hukommelse pr. bruger. Det der gør AwakenX personlig."""

    def __init__(self, user_id: str):
        MEMORY_DIR.mkdir(exist_ok=True)
        self.path = MEMORY_DIR / f"{user_id}.json"
        self.data = self._load()

    def _load(self) -> dict:
        if self.path.exists():
            return json.loads(self.path.read_text(encoding="utf-8"))
        return {
            "navn": None,
            "maal": [],                 # hvad brugeren vil kunne
            "egne_ord": [],             # brugerens egne ord for tilstande
            "moenstre": [],             # mønstre set på tværs af sessioner
            "overbevisninger": [],      # begrænsende overbevisninger, I har arbejdet med
            "gennembrud": [],           # hvad de allerede har brudt igennem
            "commitments": [],          # {dato, handling, sted, tid, status}
            "krop": {},                 # søvn/HRV/rutiner hvis oplyst
            "session_noter": [],        # kort note pr. session
        }

    def save(self):
        self.path.write_text(
            json.dumps(self.data, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    def as_context(self) -> str:
        """Hukommelsen som stille kontekst til modellen."""
        if not any(v for v in self.data.values() if v):
            return "Ingen tidligere hukommelse — det her er første session."
        return (
            "HUKOMMELSE OM BRUGEREN (brug stille og præcist, citér aldrig som arkiv):\n"
            + json.dumps(self.data, ensure_ascii=False, indent=2)
        )


# ── Agent ──────────────────────────────────────────────────────────────────
class AwakenX:
    def __init__(self, user_id: str = "default"):
        api_key = os.environ.get("MISTRAL_API_KEY")
        if not api_key:
            sys.exit("Sæt MISTRAL_API_KEY først: export MISTRAL_API_KEY='...'")
        self.client = Mistral(api_key=api_key)
        self.memory = Memory(user_id)
        self.system_prompt = load_system_prompt()
        self.history: list[dict] = []   # sessionens beskeder

    def _messages(self) -> list[dict]:
        return [
            {"role": "system", "content": self.system_prompt},
            {"role": "system", "content": self.memory.as_context()},
            *self.history,
        ]

    def chat(self, user_message: str) -> str:
        """Én udveksling. Returnerer AwakenX' svar."""
        self.history.append({"role": "user", "content": user_message})
        response = self.client.chat.complete(
            model=MODEL,
            messages=self._messages(),
            temperature=0.7,
        )
        reply = response.choices[0].message.content
        self.history.append({"role": "assistant", "content": reply})
        return reply

    def end_session(self):
        """Efter sessionen: lad modellen opdatere hukommelsen struktureret."""
        if not self.history:
            return
        extraction_prompt = (
            "Du er AwakenX' hukommelses-modul. Læs sessionen og returnér KUN gyldig JSON "
            "med felter der skal opdateres i brugerens hukommelse. Mulige felter: "
            "navn, maal, egne_ord, moenstre, overbevisninger, gennembrud, commitments "
            "(liste af {dato, handling, sted, tid, status:'aaben'}), krop, session_noter "
            "(én kort sætning om denne session). Medtag kun det, der faktisk fremgik. "
            f"Dags dato: {date.today().isoformat()}.\n\nEKSISTERENDE HUKOMMELSE:\n"
            + json.dumps(self.memory.data, ensure_ascii=False)
        )
        response = self.client.chat.complete(
            model=MODEL,
            messages=[
                {"role": "system", "content": extraction_prompt},
                {"role": "user", "content": json.dumps(self.history, ensure_ascii=False)},
            ],
            temperature=0.0,
            response_format={"type": "json_object"},
        )
        try:
            updates = json.loads(response.choices[0].message.content)
        except json.JSONDecodeError:
            return  # gem hellere intet end forkert data
        for key, value in updates.items():
            if key not in self.memory.data:
                continue
            if isinstance(self.memory.data[key], list) and isinstance(value, list):
                for item in value:
                    if item not in self.memory.data[key]:
                        self.memory.data[key].append(item)
            elif isinstance(self.memory.data[key], dict) and isinstance(value, dict):
                self.memory.data[key].update(value)
            else:
                self.memory.data[key] = value
        self.memory.save()


# ── CLI-chat til test ──────────────────────────────────────────────────────
def main():
    user_id = sys.argv[1] if len(sys.argv) > 1 else "default"
    agent = AwakenX(user_id=user_id)
    print("AwakenX kører. Skriv 'slut' for at afslutte (hukommelsen gemmes).\n")

    # AwakenX åbner selv — første besked kommer fra agenten
    opening = agent.chat("(Brugeren har netop åbnet appen. Giv din åbningsbesked.)")
    print(f"AwakenX: {opening}\n")

    while True:
        try:
            user_input = input("Dig: ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if not user_input:
            continue
        if user_input.lower() in {"slut", "exit", "quit"}:
            break
        print(f"\nAwakenX: {agent.chat(user_input)}\n")

    print("\nGemmer hukommelse ...")
    agent.end_session()
    print("Session gemt. Vi ses.")


if __name__ == "__main__":
    main()


# ── Næste skridt: web-API (når du er klar) ─────────────────────────────────
# pip install fastapi uvicorn — og tilføj:
#
#   from fastapi import FastAPI
#   app = FastAPI()
#   agents: dict[str, AwakenX] = {}
#
#   @app.post("/chat/{user_id}")
#   def chat(user_id: str, body: dict):
#       agent = agents.setdefault(user_id, AwakenX(user_id))
#       return {"reply": agent.chat(body["message"])}
#
#   @app.post("/end/{user_id}")
#   def end(user_id: str):
#       if user_id in agents:
#           agents.pop(user_id).end_session()
#       return {"status": "gemt"}
#
# Kør: uvicorn awakenx_agent:app --reload
