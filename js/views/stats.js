// Progress page and the per-skill practice list.
import { esc, bar, pct, niceTime, niceSecs, TYPE_NAMES, TIER_NAMES } from '../util.js';
import { allEx, getEx } from '../storage.js';
import { countDone, skillStats, isDone } from '../progress.js';
import { getCurriculum, allExercises, findExercise, findLesson, moduleExercises } from '../content.js';
import { activityGrid, weakAreas, statusMark, statusTag } from '../widgets.js';

export function statsPage(main) {
  const exs = allExercises();
  const stats = skillStats(exs);
  const all = countDone(exs);

  const recent = [];
  for (const rec of Object.values(allEx())) {
    const info = findExercise(rec.id);
    if (!info) continue;
    for (const a of rec.attempts || []) recent.push({ ...a, ex: info.ex });
  }
  recent.sort((a, b) => b.ts - a.ts);

  main.innerHTML = `<div class="page">
    <h1>Progress</h1>
    <p>${all.done} of ${all.total} available exercises done${all.helped ? `, ${all.helped} with help` : ''}.</p>

    <section><h2>Skills, weakest first</h2>
      ${stats.length ? `<table class="table"><thead><tr><th>Skill</th><th class="num">Exercises tried</th><th class="num">Attempts</th><th class="num">First-try pass rate</th><th class="num">Solved with help</th><th></th></tr></thead><tbody>${
        stats.map((s) => `<tr><td>${esc(s.skill)}</td><td class="num">${s.tried}</td><td class="num">${s.attempts}</td>
          <td class="num">${pct(s.first, s.tried)}%</td><td class="num">${s.helped}</td>
          <td><a href="#/skill/${encodeURIComponent(s.skill)}">Practise</a></td></tr>`).join('')
      }</tbody></table>
      <p class="muted small">First-try pass rate: of the exercises you tried, the share where your very first submission passed.</p>`
      : '<p class="muted">No submissions yet.</p>'}
    </section>

    <section><h2>Weak areas</h2>${weakAreas(5)}</section>

    <section><h2>Modules and lessons</h2>
      <table class="table"><tbody>${getCurriculum().modules.map((m) => {
        const mx = moduleExercises(m.id);
        if (!mx.length) return `<tr><th>${esc(m.title)}</th><td class="muted">Coming soon</td><td></td></tr>`;
        const mc = countDone(mx);
        return `<tr><th>${esc(m.title)}</th><td>${bar(mc.done, mc.total)}</td><td class="num">${pct(mc.done, mc.total)}%</td></tr>${
          m.lessons.map((l) => {
            const f = findLesson(l.id);
            if (!f) return '';
            const lc = countDone(f.lesson.exercises);
            return `<tr><td class="indent"><a href="#/lesson/${l.id}">${esc(l.title)}</a></td><td>${bar(lc.done, lc.total)}</td><td class="num">${pct(lc.done, lc.total)}%</td></tr>`;
          }).join('')}`;
      }).join('')}</tbody></table>
    </section>

    <section><h2>Days practised</h2>${activityGrid(26)}</section>

    <section><h2>Recent submissions</h2>
      ${recent.length ? `<table class="table"><thead><tr><th>When</th><th>Exercise</th><th>Result</th><th class="num">Tests</th><th class="num">Time</th><th class="num">Hints</th></tr></thead><tbody>${
        recent.slice(0, 40).map((a) => `<tr><td>${niceTime(a.ts)}</td><td><a href="#/ex/${a.ex.id}">${esc(a.ex.title)}</a></td>
          <td class="${a.passed ? 'good' : 'bad'}">${a.passed ? 'Pass' : 'Fail'}</td><td class="num">${a.tp ?? 0}/${a.tt ?? 0}</td>
          <td class="num">${niceSecs(a.secs)}</td><td class="num">${a.hints || 0}</td></tr>`).join('')
      }</tbody></table><p class="muted small">Open an exercise and choose History to see the code you submitted.</p>` : '<p class="muted">Nothing yet.</p>'}
    </section>
  </div>`;
  return null;
}

export function skillPage(main, skill) {
  const order = (ex) => { const r = getEx(ex.id); return !r ? 1 : r.status === 'helped' ? 0 : isDone(r) ? 3 : 2; };
  const list = allExercises().filter((ex) => (ex.skills || []).includes(skill)).sort((a, b) => order(a) - order(b));
  main.innerHTML = `<div class="page">
    <nav class="crumbs"><a href="#/progress">Progress</a></nav>
    <h1>Practise: ${esc(skill)}</h1>
    <p class="muted">${list.length} exercises use this skill. The ones you needed help with are first, then new ones.</p>
    <ul class="ex-list">${list.map((ex) => `<li><a href="#/ex/${ex.id}">${statusMark(ex.id)}<span class="t">${esc(ex.title)}</span>
      <span class="tag">${TYPE_NAMES[ex.type]}</span><span class="tag">${TIER_NAMES[ex.tier]}</span>${statusTag(ex.id)}</a></li>`).join('')}</ul>
  </div>`;
  return null;
}
