# Mistral Chat (TypeScript)

Minimal web app that calls the Mistral API with the official TypeScript SDK
([`@mistralai/mistralai`](https://www.npmjs.com/package/@mistralai/mistralai)).
The chat UI is a single static page; all API calls go through the Node server,
so `MISTRAL_API_KEY` never reaches the browser.

## Prerequisites

- Node.js >= 20 and npm
- A Mistral API key from <https://console.mistral.ai> (API Keys)

## Install dependencies

```bash
cd mistral-chat-ts
npm install
```

## Configure the API key (server-side only)

```bash
cp .env.example .env
# then edit .env and set:
# MISTRAL_API_KEY=your-mistral-api-key-here
```

Alternatively export it in your shell: `export MISTRAL_API_KEY=...`

## Run locally

```bash
npm run dev        # http://localhost:3000 with auto-reload (tsx watch)
```

Or build and run the compiled JavaScript:

```bash
npm run build
npm start          # http://localhost:3000
```

Open <http://localhost:3000> in a browser and start chatting. The server uses
the `mistral-small-latest` model (see `MODEL` in `src/server.ts`).

## How it works

- `src/server.ts` — tiny Node `http` server: serves `public/index.html` and
  exposes `POST /api/chat`, which forwards the conversation to
  `client.chat.complete({ model: 'mistral-small-latest', ... })` using the
  official SDK. Conversation history is kept in memory on the server.
- `public/index.html` — the chat interface; it only ever calls `/api/chat`.
- `.env` — holds `MISTRAL_API_KEY` locally and is git-ignored.
