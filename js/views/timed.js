// Timed mode: a fixed number of questions against the clock. No hints, no solutions.
import { $, $$, esc, niceSecs, TYPE_NAMES } from '../util.js';
import { getEx } from '../storage.js';
import { countDone, skillStats } from '../progress.js';
import { allExercises, allLessons } from '../content.js';
import { mountExercise } from './exercise.js';

let session = null; // survives moving to another page and back
const rerender = () => window.dispatchEvent(new Event('hashchange'));

/** Questions come from completed lessons, plus anything already attempted. */
function pool(skills) {
  const complete = new Set();
  for (const { lesson } of allLessons()) {
    const c = countDone(lesson.exercises);
    if (c.total && c.done === c.total) lesson.exercises.forEach((ex) => complete.add(ex.id));
  }
  return allExercises().filter((ex) => ex.type !== 'explain'
    && (complete.has(ex.id) || getEx(ex.id)?.submits)
    && (!skills.length || (ex.skills || []).some((s) => skills.includes(s))));
}

/** Random pick without repeats. Weak skills (low first-try pass rate) are more likely. */
function draw(list, count) {
  const rate = new Map(skillStats(allExercises()).map((s) => [s.skill, s.rate]));
  const items = list.map((ex) => {
    const weakness = Math.max(...(ex.skills || []).map((s) => 1 - (rate.get(s) ?? 0.7)), 0);
    return { ex, w: 1 + 3 * weakness };
  });
  const picked = [];
  while (picked.length < count && items.length) {
    let r = Math.random() * items.reduce((sum, it) => sum + it.w, 0);
    let i = 0;
    while (i < items.length - 1 && r > items[i].w) { r -= items[i].w; i++; }
    picked.push(items.splice(i, 1)[0].ex);
  }
  return picked;
}

function setup(main) {
  const everything = pool([]);
  const skills = [...new Set(everything.flatMap((ex) => ex.skills || []))].sort();
  main.innerHTML = `<div class="page">
    <h1>Timed mode</h1>
    <p class="muted">Practice for timed coding assessments. Questions come from lessons you have finished and exercises you have tried, with weak skills picked more often. No hints and no solutions until the end.</p>
    ${everything.length ? `<form class="form" data-form>
      <fieldset><legend>Number of questions</legend>
        ${[5, 10, 20].map((n, i) => `<label><input type="radio" name="count" value="${n}" ${i ? '' : 'checked'}> ${n}</label>`).join('')}
      </fieldset>
      <fieldset><legend>Time limit</legend>
        <select name="minutes" aria-label="Time limit">${[10, 15, 20, 30, 45, 60, 90].map((m) => `<option value="${m}" ${m === 20 ? 'selected' : ''}>${m} minutes</option>`).join('')}</select>
      </fieldset>
      <fieldset><legend>Skills. Leave all unticked to include everything.</legend>
        <div class="checks">${skills.map((s) => `<label><input type="checkbox" name="skill" value="${esc(s)}"> ${esc(s)}</label>`).join('')}</div>
      </fieldset>
      <p class="muted" data-avail></p>
      <button type="submit" class="btn primary">Start timed session</button>
    </form>
    <p class="muted small">Explain it exercises are left out because you mark those yourself.</p>`
    : '<p class="notice">No questions available yet. Finish a lesson or submit a few exercises first, then come back.</p>'}
  </div>`;
  const form = $('[data-form]', main);
  if (!form) return;
  const chosen = () => $$('[name="skill"]:checked', form).map((c) => c.value);
  const update = () => {
    const n = pool(chosen()).length;
    $('[data-avail]', form).textContent = `${n} question${n === 1 ? '' : 's'} available with this choice.`;
  };
  form.addEventListener('change', update);
  update();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const list = pool(chosen());
    if (!list.length) return;
    const data = new FormData(form);
    const picked = draw(list, Number(data.get('count')));
    session = {
      questions: picked.map((ex) => ({ ex, state: {}, passed: null, secs: 0 })),
      idx: 0,
      endsAt: Date.now() + Number(data.get('minutes')) * 60000,
      minutes: Number(data.get('minutes')),
      done: false,
    };
    rerender();
  });
}

function summary(main) {
  const qs = session.questions;
  const passed = qs.filter((q) => q.passed).length;
  main.innerHTML = `<div class="page">
    <h1>Timed session finished</h1>
    <p class="figure">${passed} of ${qs.length} <span>passed</span></p>
    <p class="muted">Time limit ${session.minutes} minutes. Time used ${niceSecs(qs.reduce((s, q) => s + q.secs, 0))}.</p>
    <table class="table"><thead><tr><th class="num">#</th><th>Question</th><th>Type</th><th>Skills</th><th>Result</th><th class="num">Time taken</th></tr></thead><tbody>${
      qs.map((q, i) => `<tr><td class="num">${i + 1}</td><td><a href="#/ex/${q.ex.id}">${esc(q.ex.title)}</a></td><td>${TYPE_NAMES[q.ex.type]}</td>
        <td class="muted">${esc((q.ex.skills || []).join(', '))}</td>
        <td class="${q.passed ? 'good' : 'bad'}">${q.passed ? 'Pass' : q.passed === false ? 'Fail' : 'Not answered'}</td>
        <td class="num">${niceSecs(q.secs)}</td></tr>`).join('')
    }</tbody></table>
    <p class="muted">Open a question to see hints, the solution and your submitted code in its History tab.</p>
    <div class="toolbar"><button type="button" class="btn primary" data-new>Set up another session</button></div>
  </div>`;
  $('[data-new]', main).onclick = () => { session = null; rerender(); };
}

export function timedPage(main) {
  if (!session) { setup(main); return null; }
  if (session.done || Date.now() >= session.endsAt) { session.done = true; summary(main); return null; }

  let mounted = null;
  let shownAt = Date.now();
  const leave = () => {
    const q = session.questions[session.idx];
    q.secs += (Date.now() - shownAt) / 1000;
    shownAt = Date.now();
    mounted?.destroy();
    mounted = null;
  };
  const finish = () => {
    clearInterval(tick);
    leave();
    session.done = true;
    rerender();
  };

  main.innerHTML = `<div class="page wide">
    <div class="ex-head timed-head">
      <h1 data-title></h1><span class="tag" data-type></span>
      <span class="spacer"></span>
      <span class="clock" data-clock aria-label="Time left"></span>
      <button type="button" class="btn small" data-finish>Finish session</button>
    </div>
    <div class="qnav" data-qnav></div>
    <div data-mount></div>
  </div>`;

  const clock = $('[data-clock]', main);
  const paint = () => {
    const left = Math.max(0, Math.round((session.endsAt - Date.now()) / 1000));
    clock.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    clock.classList.toggle('low', left < 60);
    if (left <= 0) finish();
  };
  const nav = () => {
    $('[data-qnav]', main).innerHTML = session.questions.map((q, i) => `<button type="button" data-q="${i}" class="${i === session.idx ? 'on' : ''} ${q.passed ? 'pass' : q.passed === false ? 'fail' : ''}" title="${q.passed ? 'Passed' : q.passed === false ? 'Not passed yet' : 'Not answered'}">${i + 1}</button>`).join('');
    $$('[data-q]', main).forEach((b) => { b.onclick = () => { leave(); session.idx = Number(b.dataset.q); showQuestion(); }; });
  };
  function showQuestion() {
    const q = session.questions[session.idx];
    $('[data-title]', main).textContent = `Question ${session.idx + 1} of ${session.questions.length}: ${q.ex.title}`;
    $('[data-type]', main).textContent = TYPE_NAMES[q.ex.type];
    nav();
    shownAt = Date.now();
    mounted = mountExercise($('[data-mount]', main), q.ex, {
      mode: 'timed',
      state: q.state,
      onResult: (r) => { q.passed = r.passed; nav(); },
    });
  }
  $('[data-finish]', main).onclick = (e) => {
    if (e.target.dataset.armed) { finish(); return; }
    e.target.dataset.armed = '1';
    e.target.textContent = 'Click again to finish';
  };
  const tick = setInterval(paint, 1000);
  showQuestion();
  paint();
  return () => { clearInterval(tick); if (!session.done) leave(); };
}
