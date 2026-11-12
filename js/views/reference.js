// Quick reference: built from the "reference" entries in every lesson.
import { $, $$, esc, codeBlock } from '../util.js';
import { highlight } from '../editor.js';
import { getCurriculum, findLesson } from '../content.js';

export function referencePage(main) {
  const groups = getCurriculum().modules.map((m) => ({
    title: m.title,
    lessons: m.lessons.map((l) => findLesson(l.id)?.lesson).filter((l) => l && (l.reference || []).length),
  })).filter((g) => g.lessons.length);

  main.innerHTML = `<div class="page">
    <h1>Quick reference</h1>
    <div class="toolbar"><input type="search" placeholder="Search syntax, for example: f-string, range, while" aria-label="Search the reference" data-search autofocus></div>
    ${groups.map((g) => `<section class="ref-group"><h2>${esc(g.title)}</h2>${g.lessons.map((l) => l.reference.map((r) => `
      <article class="ref" data-text="${esc(`${r.concept} ${r.syntax} ${r.example} ${l.title}`.toLowerCase())}">
        <h3>${esc(r.concept)} <a class="muted small" href="#/lesson/${l.id}">${esc(l.title)}</a></h3>
        <div class="ref-cols"><div><span class="label">Syntax</span>${codeBlock(r.syntax)}</div><div><span class="label">Example</span>${codeBlock(r.example)}</div></div>
      </article>`).join('')).join('')}</section>`).join('')}
    <p class="muted" data-none hidden>Nothing matches. Try a shorter word.</p>
  </div>`;
  highlight(main);
  $('[data-search]', main).addEventListener('input', (e) => {
    const terms = e.target.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    $$('.ref', main).forEach((r) => { r.hidden = !terms.every((t) => r.dataset.text.includes(t)); if (!r.hidden) shown++; });
    $$('.ref-group', main).forEach((g) => { g.hidden = !$$('.ref', g).some((r) => !r.hidden); });
    $('[data-none]', main).hidden = shown > 0;
  });
  return null;
}
