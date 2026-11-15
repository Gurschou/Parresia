# Skitsebog chat

Minimal web app: the Skitsebog (sketchbook) front page plus a simple chat
interface. The browser only talks to the local server (`POST /api/chat`);
the server calls the Mistral API with the official TypeScript SDK
(`@mistralai/mistralai`) using `mistral-small-latest`. `MISTRAL_API_KEY`
lives only on the server (`.env`) and is never sent to the browser.

## Install dependencies

```bash
cd skitsebog-chat
npm install
```

## Configure the API key (server-side only)

```bash
cp .env.example .env
# edit .env and set MISTRAL_API_KEY=... (get a key at https://console.mistral.ai)
```

Alternatively export it in your shell: `export MISTRAL_API_KEY=...`

## Run locally

```bash
npm run dev        # http://localhost:3000 (auto-reload while editing)
# or, without watch mode:
npm start          # http://localhost:3000
```

Open http://localhost:3000 and press the **CHAT** button in the top-right
corner to chat with `mistral-small-latest`.

## Other commands

```bash
npm run typecheck  # tsc --noEmit over server/
```

## How it works

- `public/index.html` — the Skitsebog WebGL page plus a chat overlay.
- `public/chat.js` — chat UI; sends the message history to `POST /api/chat`.
- `server/index.ts` — dependency-free Node server (`node:http`). Serves
  `public/` statically and exposes `POST /api/chat`, which validates the
  messages and calls `client.chat.complete({ model: 'mistral-small-latest', messages })`
  with the key from `process.env.MISTRAL_API_KEY`.

## API

`POST /api/chat`

```json
{ "messages": [{ "role": "user", "content": "Hej!" }] }
```

Response: `{ "reply": "..." }` — errors come back as `{ "error": "..." }`
with a suitable status code (400 invalid input, 500 missing key, 502 upstream failure).

Set `PORT` in `.env` to change the port (default 3000).
