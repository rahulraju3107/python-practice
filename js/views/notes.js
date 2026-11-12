// Notes panel (on every lesson and exercise) and the Notes page.
import { $, $$, el, esc, md, debounce, download, today } from '../util.js';
import { getNote, putNote, allNotes } from '../storage.js';
import { getCurriculum, moduleOfKey, describeKey } from '../content.js';
import { highlight } from '../editor.js';
import { setShortcuts } from '../keys.js';

/** Returns { el, save }. Saves as you type, and on Ctrl+S. */
export function notesPanel(key) {
  const box = el(`<section class="notes">
    <div class="notes-head"><h2>Notes</h2><span class="muted small" data-state>Saved automatically</span>
      <button type="button" class="btn small quiet" data-toggle>Preview</button></div>
    <textarea rows="8" placeholder="Write what you want to remember. Markdown works: # heading, - list, \`code\`."></textarea>
    <div class="md preview" hidden></div>
    <p class="muted small"><kbd>Ctrl+S</kbd> saves straight away.</p>
  </section>`);
  const area = $('textarea', box);
  const preview = $('.preview', box);
  const stateEl = $('[data-state]', box);
  area.value = getNote(key);
  const save = () => {
    if (area.value === getNote(key)) return;
    putNote(key, area.value);
    stateEl.textContent = 'Saved';
  };
  const later = debounce(save, 600);
  area.addEventListener('input', () => { stateEl.textContent = 'Saving'; later(); });
  $('[data-toggle]', box).onclick = (e) => {
    const showing = !preview.hidden;
    preview.hidden = showing;
    area.hidden = !showing;
    e.target.textContent = showing ? 'Preview' : 'Edit';
    if (!showing) { preview.innerHTML = md(area.value) || '<p class="muted">Nothing yet.</p>'; highlight(preview); }
  };
  setShortcuts({ save: () => { save(); stateEl.textContent = 'Saved'; } });
  return { el: box, save };
}

function grouped() {
  const notes = Object.entries(allNotes()).filter(([, n]) => n.text && n.text.trim());
  const groups = new Map();
  for (const m of getCurriculum().modules) groups.set(m.id, { title: m.title, items: [] });
  for (const [key, note] of notes) {
    const mod = moduleOfKey(key);
    const id = mod ? mod.id : 'other';
    if (!groups.has(id)) groups.set(id, { title: 'Other', items: [] });
    groups.get(id).items.push({ key, ...describeKey(key), text: note.text });
  }
  for (const g of groups.values()) g.items.sort((a, b) => a.key.localeCompare(b.key));
  return [...groups.values()].filter((g) => g.items.length);
}

function exportMarkdown() {
  let out = `# Python Practice notes\n\nExported ${today()}\n`;
  for (const g of grouped()) {
    out += `\n## ${g.title}\n`;
    for (const item of g.items) out += `\n### ${item.title}\n\n${item.text.trim()}\n`;
  }
  download(`python-practice-notes-${today()}.md`, out, 'text/markdown');
}

export function notesPage(main) {
  const groups = grouped();
  main.innerHTML = `<div class="page">
    <h1>Notes</h1>
    <div class="toolbar">
      <input type="search" placeholder="Search your notes" aria-label="Search your notes" data-search>
      <button type="button" class="btn" data-export ${groups.length ? '' : 'disabled'}>Export all as Markdown</button>
    </div>
    ${groups.length ? '' : '<p class="muted">No notes yet. Every lesson and exercise has a Notes panel. What you write there shows up here.</p>'}
    ${groups.map((g) => `<section class="note-group"><h2>${esc(g.title)}</h2>${g.items.map((item) => `
      <article class="note" data-text="${esc((item.title + ' ' + item.text).toLowerCase())}">
        <h3>${item.href ? `<a href="${item.href}">${esc(item.title)}</a>` : esc(item.title)}</h3>
        <div class="md">${md(item.text)}</div>
      </article>`).join('')}</section>`).join('')}
    <p class="muted" data-none hidden>No notes match that search.</p>
  </div>`;
  highlight(main);
  $('[data-export]', main).onclick = exportMarkdown;
  $('[data-search]', main).addEventListener('input', (e) => {
    const term = e.target.value.trim().toLowerCase();
    let shown = 0;
    $$('.note', main).forEach((n) => { n.hidden = !!term && !n.dataset.text.includes(term); if (!n.hidden) shown++; });
    $$('.note-group', main).forEach((g) => { g.hidden = !$$('.note', g).some((n) => !n.hidden); });
    $('[data-none]', main).hidden = shown > 0 || !groups.length;
  });
  return null;
}
