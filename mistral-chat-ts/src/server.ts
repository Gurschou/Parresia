import http from 'node:http';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Mistral } from '@mistralai/mistralai';

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.join(srcDir, '..');
const publicDir = path.join(projectDir, 'public');
const PORT = Number(process.env.PORT ?? 3000);
const MODEL = 'mistral-small-latest';
const MAX_HISTORY = 20;

function loadEnvFile(file: string): void {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split('\n')) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)$/);
    if (!match || match[1].startsWith('#')) continue;
    if (process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadEnvFile(path.join(projectDir, '.env'));

if (!process.env.MISTRAL_API_KEY) {
  console.error('MISTRAL_API_KEY is not set. Add it to mistral-chat-ts/.env or export it.');
  process.exit(1);
}

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const history: ChatMessage[] = [
  { role: 'system', content: 'You are a helpful assistant.' },
];

function toText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((chunk) =>
        chunk && typeof chunk === 'object' && 'text' in chunk
          ? String((chunk as { text: unknown }).text)
          : '',
      )
      .join('');
  }
  return '';
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString('utf8');
      if (data.length > 1e6) req.destroy();
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (req.method === 'POST' && url.pathname === '/api/chat') {
    try {
      const body = JSON.parse(await readBody(req));
      const message = String(body?.message ?? '').trim();
      if (!message) {
        sendJson(res, 400, { error: 'Field "message" is required.' });
        return;
      }
      history.push({ role: 'user', content: message });
      if (history.length > MAX_HISTORY + 1) history.splice(1, history.length - MAX_HISTORY - 1);

      const completion = await client.chat.complete({ model: MODEL, messages: history });
      const reply = toText(completion.choices[0]?.message?.content) || 'No response.';
      history.push({ role: 'assistant', content: reply });

      sendJson(res, 200, { reply });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  const pathname = path.normalize(url.pathname === '/' ? '/index.html' : url.pathname);
  const filePath = path.join(publicDir, pathname);
  if (!filePath.startsWith(publicDir)) {
    sendJson(res, 403, { error: 'Forbidden.' });
    return;
  }
  try {
    const content = await readFile(filePath);
    const type = pathname.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(content);
  } catch {
    sendJson(res, 404, { error: 'Not found.' });
  }
});

server.listen(PORT, () => {
  console.log(`Chat app running at http://localhost:${PORT} (model: ${MODEL})`);
});
