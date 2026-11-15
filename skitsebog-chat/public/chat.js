const $ = (id) => document.getElementById(id);
const toggle = $('chat-toggle');
const panel = $('chat-panel');
const closeBtn = $('chat-close');
const log = $('chat-log');
const form = $('chat-form');
const input = $('chat-input');
const send = $('chat-send');

const history = [];

function addMsg(role, text) {
  const div = document.createElement('div');
  div.className = 'm ' + role;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}

function setOpen(open) {
  panel.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  if (open) input.focus();
}

toggle.addEventListener('click', () => setOpen(panel.hidden));
closeBtn.addEventListener('click', () => setOpen(false));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !panel.hidden) setOpen(false);
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  history.push({ role: 'user', content: text });
  addMsg('user', text);
  send.disabled = true;
  const typing = addMsg('assistant', '…');
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    typing.remove();
    history.push({ role: 'assistant', content: data.reply });
    addMsg('assistant', data.reply);
  } catch (err) {
    typing.remove();
    addMsg('error', 'Fejl: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    send.disabled = false;
    input.focus();
  }
});
