# AGENTS.md

## Cursor Cloud specific instructions

AwakenX is a small Python app: a Mistral-AI-backed "personal coach" with
persistent per-user memory. Components:

- `awakenx_agent.py` — the `AwakenX` agent class + a CLI chat (`python awakenx_agent.py <user_id>`).
- `awakenx_api.py` — FastAPI backend exposing `POST /chat/{user_id}`, `POST /end/{user_id}`, `POST /reset/{user_id}`, `GET /status`.
- `index.html` — static single-page frontend for the chat.

Dependencies are installed by the update script into a virtualenv at `.venv`.
Activate it (`. .venv/bin/activate`) before running anything.

### Running

- Backend (dev): `uvicorn awakenx_api:app --reload` (defaults to port 8000).
- CLI chat: `python awakenx_agent.py <user_id>`.

### Non-obvious gotchas

- **`MISTRAL_API_KEY` is required for all AI functionality.** Without it, the
  CLI calls `sys.exit(...)` and the `/chat` endpoint returns HTTP 500
  (`MISTRAL_API_KEY mangler`). `GET /status` and serving the UI work without it.
  Set it as a secret / env var before testing chat.
- **`awakenx_api.py` does NOT serve `index.html`** — it only registers API
  routes. `index.html` uses `window.location.origin` as its API base, so to
  test the UI end-to-end you must serve `index.html` from the *same origin* as
  the API (e.g. add a `GET /` route that returns the file, or reverse-proxy the
  static file in front of the API). Opening `index.html` via `file://` or from a
  different port will make its `fetch` calls miss the API.
- Installed `mistralai` is the 2.x SDK; the correct client import is
  `from mistralai.client import Mistral` (as used in `awakenx_agent.py`), and the
  call is `client.chat.complete(...)`.
- Per-user memory is persisted as JSON under `awakenx_memory/` (gitignored) and
  is (re)written on `end_session()`.
