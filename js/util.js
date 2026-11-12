// Small shared helpers. No storage or network code in here.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Build one element from an HTML string. */
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

let mdReady = false;
/** Render Markdown. Raw HTML in the text is shown as text, never run. */
export function md(text) {
  if (!mdReady) {
    window.marked.use({ gfm: true, breaks: false, renderer: { html: (token) => esc(token.text ?? token.raw ?? '') } });
    mdReady = true;
  }
  return window.marked.parse(String(text ?? '')).replace(/href="\s*(javascript|data|vbscript):[^"]*"/gi, 'href="#"');
}

export function codeBlock(code, cls = '') {
  return `<pre class="code ${cls}"><code class="language-python">${esc(code)}</code></pre>`;
}

/** Same rule as the Python side: ignore trailing spaces and trailing blank lines. */
export function normOut(text) {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/\s+$/, ''));
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

export function today(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return today(new Date(y, m - 1, d + n));
}

export function daysBetween(from, to) {
  const t = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(to) - t(from)) / 86400000);
}

export function niceDay(day) {
  const diff = daysBetween(today(), day);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

export function niceTime(ts) {
  return new Date(ts).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function niceSecs(secs) {
  secs = Math.max(0, Math.round(secs || 0));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

export function debounce(fn, ms) {
  let t;
  const wrapped = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  wrapped.flush = (...args) => { clearTimeout(t); fn(...args); };
  return wrapped;
}

export function download(filename, text, mime = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pct(done, total) {
  return total ? Math.round((done / total) * 100) : 0;
}

export function bar(done, total, label = '') {
  const p = pct(done, total);
  return `<span class="bar" role="img" aria-label="${p}% complete ${esc(label)}"><span style="width:${p}%"></span></span>`;
}

export const TYPE_NAMES = { write: 'Write it', fix: 'Fix it', predict: 'Predict it', explain: 'Explain it' };
export const TIER_NAMES = { warmup: 'Warm-up', core: 'Core', stretch: 'Stretch' };
