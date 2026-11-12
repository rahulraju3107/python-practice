// The exercise workspace. Used by practice, review and timed mode.
import { $, $$, esc, md, codeBlock, niceTime, niceSecs, niceDay, debounce, TYPE_NAMES, TIER_NAMES } from '../util.js';
import { makeEditor, highlight } from '../editor.js';
import { run, busy, onStatus, pythonState, TIMEOUT_TEXT } from '../runner.js';
import { grade, gradePredict, testList } from '../grader.js';
import { getEx, getDraft, putDraft } from '../storage.js';
import { recOf, recordAttempt, settleHelped, markSawSolution, useHint, saveApproach, solutionFree, dueExercises } from '../progress.js';
import { findExercise, allExercises, nextLesson } from '../content.js';
import { setShortcuts } from '../keys.js';
import { statusTag } from '../widgets.js';
import { notesPanel } from './notes.js';
import { lessonSummaryHtml } from './lesson.js';

/** HTML for the result of one Run. Shared with the lesson page. */
export function runOutputHtml(r) {
  if (r.failed) return `<p class="bad">${esc(r.failed)}</p>`;
  if (r.timedOut) return `<p class="bad">${TIMEOUT_TEXT}</p>`;
  let html = '';
  if (r.stdout) html += `<pre class="out">${esc(r.stdout)}</pre>`;
  if (r.stderr) html += `<pre class="out err">${esc(r.stderr)}</pre>`;
  if (r.error) html += errorHtml(r.error, r.errorLine);
  return html || '<p class="muted">The code ran and printed nothing.</p>';
}

function errorHtml(text, line) {
  const marked = esc(text).replace(/\bline (\d+)/g, '<mark>line $1</mark>');
  const tip = line ? `Read the last line first: it names the error. Line ${line} is highlighted in the editor.` : 'Read the last line first: it names the error.';
  return `<pre class="out err">${marked}</pre><p class="muted small">${tip}</p>`;
}

function show(value, empty) {
  return value === '' || value == null ? `<span class="muted">${empty}</span>` : esc(value);
}

function failDetail(r) {
  if (r.notRun) return '<p class="muted">Not run, because an earlier test took too long.</p>';
  if (r.timedOut) return `<p class="bad">${TIMEOUT_TEXT}</p>`;
  if (r.internal) return `<p class="bad">${esc(r.internal)}</p>`;
  const io = r.kind === 'io';
  return `<dl class="detail">
    <dt>${io ? 'Input typed in' : 'Checked'}</dt><dd><pre>${show(r.input, '(no input)')}</pre></dd>
    <dt>Expected${io ? ' output' : ''}</dt><dd><pre>${show(r.expected, '(nothing printed)')}</pre></dd>
    <dt>${io ? 'Your output' : 'Your result'}</dt><dd><pre>${show(r.actual, '(nothing printed)')}</pre></dd>
    ${r.message ? `<dt>Note</dt><dd>${esc(r.message)}</dd>` : ''}
  </dl>${r.error && r.error.includes('\n') ? errorHtml(r.error, r.errorLine) : ''}`;
}

function resultsHtml(g) {
  return `<p class="${g.passed ? 'good' : 'bad'}"><b>${g.tp} of ${g.tt} tests passed.</b></p>
    <ul class="results">${g.results.map((r) => `
      <li class="${r.passed ? 'pass' : 'fail'}">
        <div class="r-head"><span class="verdict">${r.passed ? 'Pass' : 'Fail'}</span><span>${esc(r.name)}</span>${r.hidden ? '<span class="tag">hidden test</span>' : ''}</div>
        ${r.passed ? '' : failDetail(r)}
      </li>`).join('')}</ul>`;
}

/**
 * Mount an exercise into root.
 * opts.mode: practice | review | timed
 * opts.state: object that keeps { code, answer } between mounts (timed mode)
 * opts.onResult({ passed, outcome }), opts.nextHtml() -> HTML shown after a pass
 */
export function mountExercise(root, ex, opts = {}) {
  const mode = opts.mode || 'practice';
  const timed = mode === 'timed';
  const coding = ex.type === 'write' || ex.type === 'fix';
  const starter = ex.starter_code || '';
  const state = opts.state || {};
  const hints = ex.hints || [];
  let opened = Date.now();
  let revealed = false; // predict: the real output has been shown
  let settled = false;  // explain: self-assessment done

  const tabs = [['task', 'Task']];
  if (!timed) {
    if (ex.type !== 'explain') tabs.push(['solution', 'Solution']);
    tabs.push(['history', 'History'], ['notes', 'Notes']);
  }
  const submitLabel = { write: 'Submit', fix: 'Submit', predict: 'Check answer', explain: 'Show model answer' }[ex.type];
  const usesInput = /\binput\s*\(/.test(starter + (ex.solution || ''));

  root.innerHTML = `<div class="ex">
    <div class="ex-left">
      <div class="tabs">${tabs.map(([k, n], i) => `<button type="button" data-tab="${k}" class="${i ? '' : 'on'}">${n}</button>`).join('')}</div>
      ${tabs.map(([k], i) => `<div class="pane" data-pane="${k}" ${i ? 'hidden' : ''}></div>`).join('')}
    </div>
    <div class="ex-right">
      <div class="editor" data-editor></div>
      ${ex.type === 'predict' ? '<label class="field"><span>Your answer. Type the exact output, one line per printed line.</span><textarea class="mono" data-answer rows="4" spellcheck="false" autocapitalize="off" autocomplete="off"></textarea></label>' : ''}
      ${ex.type === 'explain' ? '<label class="field"><span>Your explanation. Say what the code does, why, and what happens in edge cases.</span><textarea data-answer rows="7"></textarea></label>' : ''}
      <div class="toolbar">
        <button type="button" class="btn" data-run>Run <kbd>Ctrl+Enter</kbd></button>
        <button type="button" class="btn primary" data-submit>${submitLabel} <kbd>Ctrl+Shift+Enter</kbd></button>
        ${coding ? '<button type="button" class="btn quiet" data-reset>Reset code</button>' : ''}
        <span class="muted small" data-status></span>
      </div>
      ${coding || (ex.type === 'explain' && usesInput) ? '<label class="field"><span>Input for Run. One line for each input() call.</span><textarea class="mono" data-stdin rows="2" spellcheck="false"></textarea></label>' : ''}
      <div class="console" data-console aria-live="polite"><p class="muted">Output appears here.</p></div>
      <div data-after></div>
    </div>
  </div>`;

  const q = (sel) => $(sel, root);
  const consoleEl = q('[data-console]');
  const afterEl = q('[data-after]');
  const statusEl = q('[data-status]');
  const runBtn = q('[data-run]');
  const submitBtn = q('[data-submit]');
  const answerEl = q('[data-answer]');
  const stdinEl = q('[data-stdin]');

  const initial = coding ? (state.code ?? (mode === 'practice' ? getDraft(ex.id) : null) ?? starter) : starter;
  const saveDraft = debounce((code) => putDraft(ex.id, code), 400);
  const editor = makeEditor(q('[data-editor]'), {
    value: initial,
    readOnly: !coding,
    onChange: (code) => {
      if (!coding) return;
      state.code = code;
      if (mode === 'practice') saveDraft(code);
    },
  });
  if (answerEl) {
    answerEl.value = state.answer || '';
    answerEl.addEventListener('input', () => { state.answer = answerEl.value; });
  }
  if (stdinEl) {
    const firstIo = (ex.stdin_tests || []).find((t) => !t.hidden && t.stdin);
    const firstTest = (ex.tests || []).find((t) => !t.hidden && t.stdin);
    stdinEl.value = firstIo?.stdin || firstTest?.stdin || '';
  }
  if (ex.type === 'predict') {
    runBtn.disabled = true;
    runBtn.title = 'Check your answer first. Then you can run the code.';
  }

  const elapsed = () => {
    const secs = Math.min(1800, Math.round((Date.now() - opened) / 1000));
    opened = Date.now();
    return secs;
  };
  const setStatus = (text) => { statusEl.textContent = text; };
  const working = (flag, text = '') => {
    submitBtn.disabled = flag;
    if (ex.type !== 'predict' || revealed) runBtn.disabled = flag;
    setStatus(flag ? (pythonState() === 'ready' ? text : 'Loading Python...') : '');
  };
  const stopStatus = onStatus((s) => { if (busy() && s === 'ready') setStatus('Running'); });

  // ---- task pane ----
  function renderTask() {
    const pane = q('[data-pane="task"]');
    const all = testList(ex);
    const visible = all.filter((t) => !t.hidden);
    const hiddenCount = all.length - visible.length;
    const files = Object.entries(ex.files || {});
    pane.innerHTML = `<div class="md">${md(ex.prompt)}</div>
      ${files.length ? `<h3>Files</h3>${files.map(([name, text]) => `<details class="file"><summary>${esc(name)}</summary><pre class="code plain">${esc(text)}</pre></details>`).join('')}` : ''}
      ${coding && visible.length ? `<h3>Tests you can see</h3><ul class="tests">${visible.map((t) => `<li><span class="t-name">${esc(t.name)}</span>${
        t.kind === 'assert'
          ? (t.stdin ? `<div class="io"><div><b>Input</b><pre class="code plain">${esc(t.stdin)}</pre></div></div>` : '') + codeBlock(t.code)
          : `<div class="io"><div><b>Input</b><pre class="code plain">${show(t.stdin, '(no input)')}</pre></div><div><b>Expected output</b><pre class="code plain">${show(t.expected_stdout, '(nothing printed)')}</pre></div></div>`
      }</li>`).join('')}</ul>${hiddenCount ? `<p class="muted small">Submit also runs ${hiddenCount} hidden test${hiddenCount === 1 ? '' : 's'}. You see their details after you submit.</p>` : ''}` : ''}
      ${!timed && hints.length ? '<h3>Hints</h3><ol class="hints" data-hints></ol><button type="button" class="btn small" data-hint></button>' : ''}`;
    highlight(pane);
    if (!timed && hints.length) renderHints();
  }

  function renderHints() {
    const shown = Math.min(recOf(ex.id).hints || 0, hints.length);
    q('[data-hints]').innerHTML = hints.slice(0, shown).map((h) => `<li class="md">${md(h)}</li>`).join('');
    const btn = q('[data-hint]');
    btn.hidden = shown >= hints.length;
    btn.textContent = `Show hint ${shown + 1} of ${hints.length}`;
    btn.onclick = () => { useHint(ex.id, shown + 1); renderHints(); };
  }

  // ---- solution pane ----
  function solutionBody() {
    if (ex.type === 'predict') {
      return `<h3>Real output</h3><pre class="code plain">${show(ex.expected_output, '(nothing printed)')}</pre><div class="md">${md(ex.solution_explanation || '')}</div>`;
    }
    return `${codeBlock(ex.solution || '')}<div class="md">${md(ex.solution_explanation || '')}</div>`;
  }

  function renderSolution() {
    const pane = q('[data-pane="solution"]');
    if (!pane) return;
    const rec = recOf(ex.id);
    if (solutionFree(rec) || rec.saw || revealed) {
      pane.innerHTML = solutionBody();
      highlight(pane);
      return;
    }
    const unlocked = rec.fails >= 2;
    pane.innerHTML = `<p>${unlocked ? 'Unlocked after two failed submissions.' : `Locked. It unlocks after two failed submissions (${rec.fails} so far).`}</p>
      <p>Opening the solution marks this exercise as <b>Solved with help</b>. It then comes back for review tomorrow.</p>
      <div class="toolbar"><button type="button" class="btn" data-show>Show solution</button></div>`;
    $('[data-show]', pane).onclick = () => {
      if (unlocked) { openSolution(); return; }
      pane.innerHTML = `<p>Show the solution now? You have not had two failed submissions yet.</p>
        <div class="toolbar"><button type="button" class="btn" data-yes>Yes, show the solution</button><button type="button" class="btn quiet" data-no>Keep trying</button></div>`;
      $('[data-yes]', pane).onclick = openSolution;
      $('[data-no]', pane).onclick = renderSolution;
    };
  }

  function openSolution() {
    if (ex.type === 'predict') {
      settleHelped(ex.id);
      reveal();
      opts.onResult?.({ passed: false, outcome: 'helped' });
    } else {
      markSawSolution(ex.id);
    }
    renderSolution();
  }

  // ---- history pane ----
  function renderHistory() {
    const pane = q('[data-pane="history"]');
    if (!pane) return;
    const attempts = [...(getEx(ex.id)?.attempts || [])].reverse();
    if (!attempts.length) { pane.innerHTML = '<p class="muted">No submissions yet.</p>'; return; }
    pane.innerHTML = `<table class="table"><thead><tr><th>When</th><th>Result</th><th class="num">Tests</th><th class="num">Time</th><th class="num">Hints</th><th></th></tr></thead><tbody>${
      attempts.map((a, i) => `<tr>
        <td>${niceTime(a.ts)}${a.mode && a.mode !== 'practice' ? ` <span class="tag">${a.mode}</span>` : ''}</td>
        <td class="${a.passed ? 'good' : 'bad'}">${a.passed ? 'Pass' : 'Fail'}${a.saw ? ' <span class="tag warn">saw solution</span>' : ''}</td>
        <td class="num">${a.tp ?? 0}/${a.tt ?? 0}</td><td class="num">${niceSecs(a.secs)}</td><td class="num">${a.hints || 0}</td>
        <td><button type="button" class="btn small quiet" data-view="${i}">View</button></td></tr>
        <tr hidden data-code="${i}"><td colspan="6"><pre class="code plain">${esc(a.code || '(not saved)')}</pre>${a.approach ? `<p><b>Your approach:</b> ${esc(a.approach)}</p>` : ''}</td></tr>`).join('')
    }</tbody></table>`;
    $$('[data-view]', pane).forEach((b) => {
      b.onclick = () => { const row = $(`[data-code="${b.dataset.view}"]`, pane); row.hidden = !row.hidden; };
    });
  }

  // ---- tabs ----
  let notes = null;
  $$('[data-tab]', root).forEach((btn) => {
    btn.onclick = () => {
      $$('[data-tab]', root).forEach((b) => b.classList.toggle('on', b === btn));
      $$('[data-pane]', root).forEach((p) => { p.hidden = p.dataset.pane !== btn.dataset.tab; });
      if (btn.dataset.tab === 'solution') renderSolution();
      if (btn.dataset.tab === 'history') renderHistory();
      if (btn.dataset.tab === 'notes' && !notes) {
        notes = notesPanel(ex.id);
        q('[data-pane="notes"]').append(notes.el);
      }
    };
  });

  // ---- after a submission ----
  function renderAfter(outcome, passed, rec) {
    if (timed) { afterEl.innerHTML = ''; return; }
    if (!passed) {
      afterEl.innerHTML = coding ? `<p class="notice">${rec.fails >= 2
        ? 'The solution is now unlocked in the Solution tab. Try the hints first.'
        : 'Start with the first failed test. Fix one thing, then submit again.'}</p>` : '';
      return;
    }
    const label = { solved: 'Solved.', helped: 'Solved with help.', reviewed: 'Review passed.', practice: 'Passed.' }[outcome];
    afterEl.innerHTML = `<p class="notice ${outcome === 'helped' ? 'warn' : 'ok'}"><b>${label}</b> ${rec.due ? `Next review: ${niceDay(rec.due)}.` : ''}</p>
      ${coding ? `<label class="field"><span>Explain your approach in 2 or 3 sentences. Optional, saved with this attempt.</span><textarea data-approach rows="3"></textarea></label>
        <div class="toolbar"><button type="button" class="btn small" data-save-approach>Save explanation</button><span class="muted small" data-approach-status></span></div>` : ''}
      <div class="next">${opts.nextHtml?.() || ''}</div>`;
    const save = $('[data-save-approach]', afterEl);
    if (save) {
      save.onclick = () => {
        saveApproach(ex.id, $('[data-approach]', afterEl).value.trim());
        $('[data-approach-status]', afterEl).textContent = 'Saved.';
      };
    }
  }

  // ---- run ----
  async function doRun() {
    if (busy() || runBtn.disabled) return;
    editor.clearError();
    working(true, 'Running');
    const r = await run({ code: editor.value, stdin: stdinEl?.value || '', files: ex.files || null });
    working(false);
    consoleEl.innerHTML = runOutputHtml(r);
    if (r.errorLine) editor.markError(r.errorLine);
  }

  // ---- submit: write and fix ----
  async function submitCode() {
    if (busy()) return;
    const code = editor.value;
    editor.clearError();
    working(true, 'Running tests');
    const g = await grade(ex, code);
    working(false);
    if (g.failed) { consoleEl.innerHTML = `<p class="bad">${esc(g.failed)}</p>`; return; }
    const { rec, outcome } = recordAttempt(ex.id, { passed: g.passed, tp: g.tp, tt: g.tt, secs: elapsed(), code, mode });
    consoleEl.innerHTML = resultsHtml(g);
    const firstError = g.results.find((r) => !r.passed && r.errorLine);
    if (firstError) editor.markError(firstError.errorLine);
    renderAfter(outcome, g.passed, rec);
    opts.onResult?.({ passed: g.passed, outcome });
  }

  // ---- submit: predict ----
  function reveal() {
    revealed = true;
    runBtn.disabled = false;
    runBtn.title = '';
    submitBtn.disabled = true;
    if (answerEl) answerEl.readOnly = true;
  }

  function submitPredict() {
    if (revealed) return;
    const answer = answerEl.value;
    if (!answer.trim()) { setStatus('Type the output first.'); return; }
    setStatus('');
    const ok = gradePredict(ex, answer);
    const { rec, outcome } = recordAttempt(ex.id, { passed: ok, tp: ok ? 1 : 0, tt: 1, secs: elapsed(), code: answer, mode });
    if (timed) {
      consoleEl.innerHTML = ok ? '<p class="good"><b>Correct.</b></p>' : '<p class="bad"><b>Not correct.</b> You can change your answer and check again.</p>';
      opts.onResult?.({ passed: ok, outcome });
      return;
    }
    if (ok) {
      reveal();
      consoleEl.innerHTML = `<p class="good"><b>Correct.</b> You can run the code now.</p><div class="md">${md(ex.solution_explanation || '')}</div>`;
      renderAfter(outcome, true, rec);
    } else if (rec.fails >= 2) {
      const done = settleHelped(ex.id);
      reveal();
      consoleEl.innerHTML = `<p class="bad"><b>Not quite.</b> Here is the real output. Compare it with yours, then run the code.</p>
        <div class="io"><div><b>Real output</b><pre class="code plain">${show(ex.expected_output, '(nothing printed)')}</pre></div><div><b>Your answer</b><pre class="code plain">${esc(answer)}</pre></div></div>
        <div class="md">${md(ex.solution_explanation || '')}</div>`;
      renderAfter('helped', true, done);
    } else {
      consoleEl.innerHTML = '<p class="bad"><b>Not quite.</b> Trace the code again, one line at a time. You have one more try before the answer is shown.</p>';
    }
    opts.onResult?.({ passed: ok, outcome });
  }

  // ---- submit: explain (self-assessed) ----
  function submitExplain() {
    if (settled) return;
    const text = answerEl.value.trim();
    if (text.length < 15) { setStatus('Write a few sentences first.'); return; }
    setStatus('');
    const list = ex.checklist || [];
    afterEl.innerHTML = `<div class="panel">
      <h3>Model explanation</h3><div class="md">${md(ex.model_explanation || '')}</div>
      <h3>Tick what your answer covered</h3>
      <ul class="checklist">${list.map((c, i) => `<li><label><input type="checkbox" data-c="${i}"> ${esc(c)}</label></li>`).join('')}</ul>
      <div class="toolbar"><button type="button" class="btn primary" data-got>Got it</button><button type="button" class="btn" data-missed>Missed things</button></div>
      <p class="muted small">You mark this one yourself. Be honest: "Missed things" brings it back for review tomorrow.</p>
      <div data-explain-done></div></div>`;
    highlight(afterEl);
    const finish = (got) => {
      if (settled) return;
      settled = true;
      const ticks = $$('[data-c]', afterEl).filter((c) => c.checked).length;
      let { rec, outcome } = recordAttempt(ex.id, { passed: got, tp: ticks, tt: list.length, secs: elapsed(), code: text, mode });
      if (!got) { rec = settleHelped(ex.id); outcome = 'helped'; }
      $$('[data-got],[data-missed],[data-c]', afterEl).forEach((b) => { b.disabled = true; });
      const label = got ? (outcome === 'reviewed' ? 'Review passed.' : 'Marked as got it.') : 'Marked as missed things.';
      $('[data-explain-done]', afterEl).innerHTML = `<p class="notice ${got ? 'ok' : 'warn'}"><b>${label}</b> ${rec.due ? `Next review: ${niceDay(rec.due)}.` : ''}</p><div class="next">${opts.nextHtml?.() || ''}</div>`;
      opts.onResult?.({ passed: got, outcome });
    };
    $('[data-got]', afterEl).onclick = () => finish(true);
    $('[data-missed]', afterEl).onclick = () => finish(false);
  }

  const doSubmit = { write: submitCode, fix: submitCode, predict: submitPredict, explain: submitExplain }[ex.type];
  runBtn.onclick = doRun;
  submitBtn.onclick = doSubmit;
  const resetBtn = q('[data-reset]');
  if (resetBtn) {
    resetBtn.onclick = () => {
      if (resetBtn.dataset.armed) {
        editor.value = starter;
        delete resetBtn.dataset.armed;
        resetBtn.textContent = 'Reset code';
      } else {
        resetBtn.dataset.armed = '1';
        resetBtn.textContent = 'Click again to reset';
        setTimeout(() => { delete resetBtn.dataset.armed; resetBtn.textContent = 'Reset code'; }, 3000);
      }
    };
  }
  setShortcuts({ run: doRun, submit: doSubmit });
  renderTask();
  setTimeout(() => editor.refresh(), 0);

  return {
    destroy() {
      stopStatus();
      if (coding && mode === 'practice' && editor.value !== (getDraft(ex.id) ?? starter)) putDraft(ex.id, editor.value);
      notes?.save();
    },
  };
}

/** Full page for one exercise, in practice or review mode. */
export function exercisePage(main, id, mode) {
  const found = findExercise(id);
  if (!found) {
    main.innerHTML = '<div class="page"><h1>Exercise not found</h1><p><a href="#/learn">Back to Learn</a></p></div>';
    return null;
  }
  const { ex, lesson } = found;
  const list = lesson.exercises;
  const idx = list.indexOf(ex);
  const prev = list[idx - 1];
  const next = list[idx + 1];
  const review = mode === 'review';

  main.innerHTML = `<div class="page wide">
    <nav class="crumbs"><a href="#/learn">Learn</a> / <a href="#/lesson/${lesson.id}">${esc(lesson.title)}</a></nav>
    <div class="ex-head">
      <h1>${esc(ex.title)}</h1>
      <span class="tag">${TYPE_NAMES[ex.type]}</span><span class="tag">${TIER_NAMES[ex.tier]}</span>
      <span data-status>${statusTag(ex.id)}</span>
      <span class="spacer"></span>
      ${review ? '<a class="btn small" href="#/review">Review list</a>' : `
        ${prev ? `<a class="btn small" href="#/ex/${prev.id}">Previous</a>` : ''}
        <span class="muted small">${idx + 1} of ${list.length}</span>
        ${next ? `<a class="btn small" href="#/ex/${next.id}">Next</a>` : ''}`}
    </div>
    ${review ? '<p class="notice">Review. The editor starts from the starter code. Solve it again from memory.</p>' : ''}
    <div data-mount></div>
  </div>`;

  const nextHtml = () => {
    if (review) {
      const due = dueExercises(allExercises()).filter((e) => e.id !== ex.id);
      return due.length
        ? `<a class="btn primary" href="#/review/${due[0].id}">Next review (${due.length} left)</a>`
        : '<p>No more reviews due today.</p><a class="btn" href="#/">Dashboard</a>';
    }
    if (next) return `<a class="btn primary" href="#/ex/${next.id}">Next exercise</a>`;
    const after = nextLesson(lesson.id);
    return `${lessonSummaryHtml(lesson)}<div class="toolbar">${after ? `<a class="btn primary" href="#/lesson/${after.id}">Next lesson: ${esc(after.title)}</a>` : ''}<a class="btn" href="#/lesson/${lesson.id}">Back to the lesson</a></div>`;
  };

  const mounted = mountExercise($('[data-mount]', main), ex, {
    mode,
    nextHtml,
    onResult: () => { $('[data-status]', main).innerHTML = statusTag(ex.id); },
  });
  return () => mounted.destroy();
}
