import 'dotenv/config';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Mistral } from '@mistralai/mistralai';

const PORT = Number(process.env.PORT ?? 3000);
const PUBLIC_DIR = normalize(fileURLToPath(new URL('../public/', import.meta.url)));
const PUBLIC_ROOT = PUBLIC_DIR.endsWith(sep) ? PUBLIC_DIR.slice(0, -1) : PUBLIC_DIR;
const MODEL = 'mistral-small-latest';
const MAX_BODY_BYTES = 256 * 1024;
const MAX_MESSAGES = 50;
const MAX_CONTENT_CHARS = 8000;

type Role = 'system' | 'user' | 'assistant';
interface ChatMessage {
  role: Role;
  content: string;
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Nøglen læses kun her på serveren — den når aldrig browseren.
const apiKey = process.env.MISTRAL_API_KEY;
const client = apiKey ? new Mistral({ apiKey }) : null;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Request body er for stor.');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Body skal være gyldig JSON.');
  }
}

function sanitizeMessages(input: unknown): ChatMessage[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new HttpError(400, '"messages" skal være et ikke-tomt array.');
  }
  const messages: ChatMessage[] = [];
  for (const raw of input.slice(-MAX_MESSAGES)) {
    if (typeof raw !== 'object' || raw === null) throw new HttpError(400, 'Ugyldig besked i "messages".');
    const { role, content } = raw as { role?: unknown; content?: unknown };
    if (role !== 'system' && role !== 'user' && role !== 'assistant') {
      throw new HttpError(400, `Ugyldig role: ${String(role)}. Brug system, user eller assistant.`);
    }
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new HttpError(400, '"content" skal være en ikke-tom streng.');
    }
    messages.push({ role, content: content.slice(0, MAX_CONTENT_CHARS) });
  }
  return messages;
}

async function handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req);
  const messages = sanitizeMessages((body as { messages?: unknown })?.messages);
  if (!client) {
    sendJson(res, 500, { error: 'MISTRAL_API_KEY er ikke sat på serveren. Kopier .env.example til .env og sæt nøglen.' });
    return;
  }
  try {
    const completion = await client.chat.complete({ model: MODEL, messages });
    const content = completion.choices?.[0]?.message?.content;
    const reply =
      typeof content === 'string'
        ? content
        : (content ?? [])
            .map((chunk) => (chunk.type === 'text' ? chunk.text : ''))
            .join('');
    sendJson(res, 200, { reply });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    sendJson(res, 502, { error: `Mistral API-kaldet fejlede: ${detail}` });
  }
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  if (pathname === '/') pathname = '/index.html';
  const filePath = normalize(join(PUBLIC_ROOT, pathname));
  if (filePath !== PUBLIC_ROOT && !filePath.startsWith(PUBLIC_ROOT + sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[extname(filePath)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

const server = createServer((req, res) => {
  if (req.method === 'POST' && req.url?.startsWith('/api/chat')) {
    handleChat(req, res).catch((error: unknown) => {
      if (error instanceof HttpError) sendJson(res, error.status, { error: error.message });
      else {
        console.error(error);
        sendJson(res, 500, { error: 'Intern serverfejl.' });
      }
    });
    return;
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    serveStatic(req, res);
    return;
  }
  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Method not allowed');
});

server.listen(PORT, () => {
  console.log(`Skitsebog chat kører på http://localhost:${PORT}`);
  if (!client) console.warn('ADVARSEL: MISTRAL_API_KEY mangler — /api/chat vil fejle indtil .env er sat op.');
});
