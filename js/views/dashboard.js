// Dashboard and the Learn page (module and lesson list).
import { esc, bar, pct } from '../util.js';
import { getEx } from '../storage.js';
import { countDone, dueExercises, isDone, streak } from '../progress.js';
import { getCurriculum, allExercises, findExercise, findLesson, moduleExercises } from '../content.js';
import { days } from '../storage.js';
import { today } from '../util.js';
import { activityGrid, weakAreas } from '../widgets.js';

function moduleRows() {
  return getCurriculum().modules.map((m, i) => {
    const exs = moduleExercises(m.id);
    const c = countDone(exs);
    return `<tr>
      <td class="num muted">${i + 1}</td>
      <td><a href="#/learn" data-module="${m.id}">${esc(m.title)}</a></td>
      <td>${exs.length ? `${bar(c.done, c.total, m.title)}` : '<span class="muted">Coming soon</span>'}</td>
      <td class="num">${exs.length ? `${pct(c.done, c.total)}%` : ''}</td>
    </tr>`;
  }).join('');
}

export function dashboard(main) {
  const exs = allExercises();
  const due = dueExercises(exs);
  const next = exs.find((ex) => !isDone(getEx(ex.id)));
  const nextInfo = next ? findExercise(next.id) : null;
  const run = streak();
  const doneToday = !!days()[today()];
  const all = countDone(exs);

  main.innerHTML = `<div class="page">
    <h1>Dashboard</h1>
    <div class="strip">
      <section>
        <h2>Continue</h2>
        ${nextInfo ? `<p><a href="#/ex/${next.id}">${esc(next.title)}</a><br><span class="muted">${esc(nextInfo.lesson.title)}</span></p>
          <a class="btn primary" href="#/${getEx(nextInfo.lesson.exercises[0].id) ? 'ex/' + next.id : 'lesson/' + nextInfo.lesson.id}">${all.done ? 'Continue' : 'Start the first lesson'}</a>`
        : '<p>Every available exercise is done. Keep up with reviews and timed sessions.</p>'}
      </section>
      <section>
        <h2>Reviews due</h2>
        <p class="figure">${due.length}</p>
        ${due.length ? '<a class="btn" href="#/review">Start review</a>' : '<p class="muted">Nothing due today.</p>'}
      </section>
      <section>
        <h2>Streak</h2>
        <p class="figure">${run} <span>day${run === 1 ? '' : 's'}</span></p>
        <p class="muted">${doneToday ? 'You have practised today.' : run ? 'Submit one exercise today to keep it.' : 'Submit one exercise to start a streak.'}</p>
      </section>
    </div>

    <section>
      <h2>Modules</h2>
      <table class="table modules"><tbody>${moduleRows()}</tbody></table>
      <p class="muted small">${all.done} of ${all.total} available exercises done${all.helped ? `, ${all.helped} with help` : ''}.</p>
    </section>

    <section>
      <h2>Weak areas</h2>
      ${weakAreas(5)}
    </section>

    <section>
      <h2>Days practised</h2>
      ${activityGrid()}
    </section>
  </div>`;
  return null;
}

export function learn(main) {
  const cur = getCurriculum();
  main.innerHTML = `<div class="page">
    <h1>Learn</h1>
    <p class="muted">${cur.modules.length} modules, in order. Each lesson teaches one idea, then gives you exercises from easy to hard.</p>
    ${cur.modules.map((m, i) => {
      const exs = moduleExercises(m.id);
      const c = countDone(exs);
      return `<section class="module" id="${m.id}">
        <div class="module-head">
          <h2><span class="muted">${i + 1}.</span> ${esc(m.title)}</h2>
          ${exs.length ? `${bar(c.done, c.total, m.title)}<span class="muted small">${pct(c.done, c.total)}%</span>` : '<span class="tag">Coming soon</span>'}
        </div>
        <p class="muted">${esc(m.summary || '')}</p>
        <ol class="lessons">${m.lessons.map((l) => {
          const found = findLesson(l.id);
          if (!found) return `<li class="soon"><span>${esc(l.title)}</span><span class="muted small">Coming soon</span></li>`;
          const lc = countDone(found.lesson.exercises);
          return `<li><a href="#/lesson/${l.id}">${esc(l.title)}</a>${bar(lc.done, lc.total, l.title)}<span class="muted small">${lc.done}/${lc.total}</span></li>`;
        }).join('')}</ol>
      </section>`;
    }).join('')}
  </div>`;
  return null;
}
