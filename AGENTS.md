# AwakenX

AwakenX is a Danish-language personal AI coaching agent with persistent per-user memory, built on Mistral AI. It ships three interfaces: a CLI (`awakenx_agent.py`), a FastAPI REST backend (`awakenx_api.py`), and a static web chat UI (`index.html`).

## Cursor Cloud specific instructions

### Environment
- Python dependencies are installed into a local virtualenv at `.venv` (created by the startup update script). Prefix commands with `./.venv/bin/` (e.g. `./.venv/bin/python`, `./.venv/bin/uvicorn`, `./.venv/bin/pip`).
- Despite the source comment `from mistralai.client import Mistral`, the pinned `mistralai>=1.0.0` (currently 2.x) exposes this import path and works as-is — no code changes needed.

### Required secret
- `MISTRAL_API_KEY` is REQUIRED for any real coaching interaction (both the CLI and the `/chat` and `/end` API endpoints call the Mistral API). Without it, `AwakenX(...)` calls `sys.exit(...)` and the API returns HTTP 500 with a "MISTRAL_API_KEY mangler" message. The `/status`, `/reset`, and `/end` (for an inactive session) endpoints work without the key. Get a key at https://console.mistral.ai and export it before running: `export MISTRAL_API_KEY="..."`.

### Running services
- Backend API: `./.venv/bin/uvicorn awakenx_api:app --host 0.0.0.0 --port 8000` (interactive docs at `/docs`). Add `--reload` for autoreload during development.
- CLI: `./.venv/bin/python awakenx_agent.py [user_id]`.
- Web UI (`index.html`): the frontend sets `API_BASE = window.location.origin`, so it only reaches the API when it is served from the SAME origin as the backend (port 8000). FastAPI does NOT mount `index.html` today, so the browser UI is not wired up out of the box — serving `index.html` from a different port will send API calls to the wrong host. Use the API directly (curl / `/docs`) or the CLI for end-to-end testing.

### Data / memory
- Per-user memory is persisted as JSON under `awakenx_memory/{user_id}.json` (gitignored, created automatically). It is written on session end (`/end` endpoint or CLI exit). There is no database.
