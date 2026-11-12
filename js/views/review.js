// Review page: everything due today.
import { esc, niceDay, addDays, today, TYPE_NAMES } from '../util.js';
import { getEx } from '../storage.js';
import { dueExercises, isDone, INTERVALS } from '../progress.js';
import { allExercises, findExercise } from '../content.js';

export function reviewPage(main) {
  const exs = allExercises();
  const due = dueExercises(exs);
  const week = addDays(today(), 7);
  const soon = exs.filter((ex) => { const r = getEx(ex.id); return isDone(r) && r.due > today() && r.due <= week; }).length;

  main.innerHTML = `<div class="page">
    <h1>Review</h1>
    <p class="muted">Solved exercises come back after 1, 3, 7, 14 and 30 days. A failed review, or one solved with help, starts again at 1 day.</p>
    ${due.length ? `<div class="toolbar"><a class="btn primary" href="#/review/${due[0].id}">Start review (${due.length} due)</a></div>
      <table class="table"><thead><tr><th>Exercise</th><th>Lesson</th><th>Type</th><th>Last result</th><th>Due</th><th>Next gap if passed</th></tr></thead><tbody>${
        due.map((ex) => {
          const rec = getEx(ex.id);
          const info = findExercise(ex.id);
          const gap = INTERVALS[Math.min(rec.stage + 1, INTERVALS.length - 1)];
          return `<tr><td><a href="#/review/${ex.id}">${esc(ex.title)}</a></td><td class="muted">${esc(info.lesson.title)}</td><td>${TYPE_NAMES[ex.type]}</td>
            <td>${rec.status === 'helped' ? '<span class="tag warn">Solved with help</span>' : '<span class="tag ok">Solved</span>'}</td>
            <td>${niceDay(rec.due)}</td><td>${gap} days</td></tr>`;
        }).join('')
      }</tbody></table>` : '<p class="notice ok"><b>Nothing due today.</b> Solve new exercises and they will show up here tomorrow.</p>'}
    <p class="muted">${soon} more due in the next 7 days.</p>
  </div>`;
  return null;
}
