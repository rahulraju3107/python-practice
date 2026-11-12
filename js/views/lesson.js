// Lesson page: the fixed lesson structure, runnable examples, quick checks, exercise list.
import { $, $$, esc, md, codeBlock, normOut, bar, TYPE_NAMES, TIER_NAMES } from '../util.js';
import { makeEditor, highlight } from '../editor.js';
import { run, busy } from '../runner.js';
import { getEx, getLesson, putLesson } from '../storage.js';
import { countDone, isDone } from '../progress.js';
import { findLesson, getCurriculum } from '../content.js';
import { setShortcuts } from '../keys.js';
import { statusMark } from '../widgets.js';
import { notesPanel } from './notes.js';
import { runOutputHtml } from './exercise.js';

export function lessonSummaryHtml(lesson) {
  const c = countDone(lesson.exercises);
  if (!c.total || c.done < c.total) return '';
  const skills = new Map();
  lesson.exercises.forEach((ex) => (ex.skills || []).forEach((s) => skills.set(s, (skills.get(s) || 0) + 1)));
  const list = [...skills].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${esc(s)} (${n})`).join(', ');
  return `<section class="panel done">
    <h2>Lesson complete</h2>
    <p>${c.total} exercises done${c.helped ? `, ${c.helped} of them with help` : ', all without help'}.</p>
    <p><b>What you practised:</b> ${list}.</p>
    <p class="muted">Every exercise comes back on the Review page so it sticks.</p>
  </section>`;
}

const section = (title, body) => (body ? `<section class="lsec"><h2>${title}</h2>${body}</section>` : '');

export function lessonPage(main, id) {
  const found = findLesson(id);
  if (!found) {
    const listed = getCurriculum().modules.flatMap((m) => m.lessons).find((l) => l.id === id);
    main.innerHTML = `<div class="page"><nav class="crumbs"><a href="#/learn">Learn</a></nav>
      <h1>${esc(listed ? listed.title : 'Lesson not found')}</h1>
      <p>${listed ? 'Coming soon. This lesson is in the plan but has not been written yet.' : ''}</p></div>`;
    return null;
  }
  const { lesson, module } = found;
  const examples = lesson.examples || [];
  const quick = lesson.quick_checks || [];
  const rec = getLesson(lesson.id);

  const exampleHtml = examples.map((e, i) => `<div class="example" data-example="${i}">
      <h3>Example ${i + 1}. ${esc(e.title || '')}</h3>
      <div class="editor small" data-editor></div>
      <div class="toolbar">
        <button type="button" class="btn small" data-run>Run${i === 0 ? ' <kbd>Ctrl+Enter</kbd>' : ''}</button>
        <button type="button" class="btn small quiet" data-reset>Reset</button>
        <span class="muted small">You can edit this code.</span>
      </div>
      ${e.stdin != null ? `<label class="field"><span>Input</span><textarea class="mono" rows="2" data-stdin spellcheck="false">${esc(e.stdin)}</textarea></label>` : ''}
      <div class="console" data-console><span class="label">Output</span><pre class="out">${esc(e.output || '')}</pre></div>
      <div class="md">${md(e.explain || '')}</div>
    </div>`).join('');

  const mistakeHtml = (lesson.mistakes || []).map((m) => `<div class="mistake">
      <h3>${esc(m.title)}</h3>
      ${m.code ? codeBlock(m.code) : ''}
      ${m.error ? `<pre class="code plain err">${esc(m.error)}</pre>` : ''}
      <div class="md">${md(m.fix || '')}</div>
    </div>`).join('');

  const quickHtml = quick.map((qc, i) => `<div class="quick" data-quick="${i}">
      <p><b>Question ${i + 1}.</b> What does this print? Work it out in your head.</p>
      ${codeBlock(qc.code)}
      <label class="field"><span>Your answer</span><textarea class="mono" rows="3" spellcheck="false" autocapitalize="off"></textarea></label>
      <div class="toolbar"><button type="button" class="btn small" data-check>Check answer</button></div>
      <div data-result></div>
    </div>`).join('');

  const tiers = ['warmup', 'core', 'stretch'];
  const c = countDone(lesson.exercises);
  const firstOpen = lesson.exercises.find((ex) => !isDone(getEx(ex.id)));
  const exHtml = `<p class="row">${bar(c.done, c.total)} <span class="muted">${c.done} of ${c.total} done</span>
      ${firstOpen ? `<a class="btn primary" href="#/ex/${firstOpen.id}">${c.done ? 'Continue' : 'Start exercises'}</a>` : ''}</p>
    ${tiers.map((tier) => {
      const list = lesson.exercises.filter((ex) => ex.tier === tier);
      if (!list.length) return '';
      return `<h3>${TIER_NAMES[tier]}</h3><ul class="ex-list">${list.map((ex) => `<li><a href="#/ex/${ex.id}">${statusMark(ex.id)}<span class="t">${esc(ex.title)}</span><span class="tag">${TYPE_NAMES[ex.type]}</span></a></li>`).join('')}</ul>`;
    }).join('')}`;

  main.innerHTML = `<div class="page lesson">
    <nav class="crumbs"><a href="#/learn">Learn</a> / ${esc(module.title)}</nav>
    <h1>${esc(lesson.title)}</h1>
    <div class="lesson-cols">
      <article>
        ${section('Recap', lesson.recap ? `<div class="md">${md(lesson.recap)}</div>` : '')}
        ${section('What it is', `<div class="md">${md(lesson.what)}</div>`)}
        ${section('Why it exists', `<div class="md">${md(lesson.why)}</div>`)}
        ${section('Syntax', `<div class="md">${md(lesson.syntax)}</div>`)}
        ${section('Worked examples', exampleHtml)}
        ${section('Common mistakes', mistakeHtml)}
        ${section('Remember it', lesson.remember ? `<p class="remember">${esc(lesson.remember)}</p>` : '')}
        ${section('Quick check', quickHtml)}
        <section class="lsec" id="exercises"><h2>Exercises</h2>${exHtml}${lessonSummaryHtml(lesson)}</section>
      </article>
      <aside data-notes></aside>
    </div>
  </div>`;
  highlight(main);

  // Runnable examples
  let active = 0;
  const runners = [];
  $$('[data-example]', main).forEach((box, i) => {
    const e = examples[i];
    const editor = makeEditor($('[data-editor]', box), { value: e.code });
    editor.cm.on('focus', () => { active = i; });
    const out = $('[data-console]', box);
    const go = async () => {
      if (busy()) return;
      editor.clearError();
      out.innerHTML = '<span class="label">Output</span><p class="muted">Running. The first run loads Python, which takes a few seconds.</p>';
      const r = await run({ code: editor.value, stdin: $('[data-stdin]', box)?.value || '' });
      out.innerHTML = `<span class="label">Output</span>${runOutputHtml(r)}`;
      if (r.errorLine) editor.markError(r.errorLine);
    };
    $('[data-run]', box).onclick = go;
    $('[data-reset]', box).onclick = () => { editor.value = e.code; };
    runners.push(go);
    setTimeout(() => editor.refresh(), 0);
  });
  setShortcuts({ run: () => runners[active]?.() });

  // Quick checks
  $$('[data-quick]', main).forEach((box, i) => {
    const qc = quick[i];
    $('[data-check]', box).onclick = () => {
      const answer = $('textarea', box).value;
      if (!answer.trim()) return;
      const ok = normOut(answer) === normOut(qc.expected_output);
      $('[data-result]', box).innerHTML = `<p class="${ok ? 'good' : 'bad'}"><b>${ok ? 'Correct.' : 'Not quite.'}</b> The real output:</p>
        <pre class="code plain">${esc(qc.expected_output)}</pre><div class="md">${md(qc.explain || '')}</div>`;
      const latest = getLesson(lesson.id);
      putLesson(lesson.id, { ...latest, quick: { ...(latest.quick || {}), [i]: ok } });
    };
  });

  const notes = notesPanel(lesson.id);
  $('[data-notes]', main).append(notes.el);
  return () => notes.save();
}
