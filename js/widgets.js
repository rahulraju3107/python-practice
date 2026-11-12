// Small pieces of UI shared by several pages.
import { esc, today, addDays, pct } from './util.js';
import { days, getEx } from './storage.js';
import { skillStats, isDue } from './progress.js';
import { allExercises } from './content.js';

/** Plain grid of days practised. Columns are weeks, newest on the right. */
export function activityGrid(weeks = 20) {
  const data = days();
  const end = today();
  const dow = (new Date().getDay() + 6) % 7; // Monday = 0
  const start = addDays(end, -(weeks * 7 - 1) - dow + 6);
  let cells = '';
  let total = 0;
  for (let i = 0; ; i++) {
    const day = addDays(start, i);
    if (day > end) break;
    const n = data[day] || 0;
    if (n) total++;
    const level = n === 0 ? 0 : n < 3 ? 1 : n < 8 ? 2 : 3;
    cells += `<i class="l${level}" title="${day}: ${n} submission${n === 1 ? '' : 's'}"></i>`;
  }
  return `<div class="grid-days" role="img" aria-label="${total} days practised in the last ${weeks} weeks">${cells}</div>
    <p class="muted small">${total} day${total === 1 ? '' : 's'} practised in the last ${weeks} weeks. Each square is one day.</p>`;
}

/** The five skills with the lowest first-try pass rate. */
export function weakAreas(limit = 5) {
  const stats = skillStats(allExercises()).slice(0, limit);
  if (!stats.length) return '<p class="muted">No data yet. Submit a few exercises and your weakest skills show here.</p>';
  return `<table class="table"><thead><tr><th>Skill</th><th class="num">First-try pass rate</th><th></th></tr></thead><tbody>${
    stats.map((s) => `<tr><td>${esc(s.skill)}</td><td class="num">${pct(s.first, s.tried)}%</td><td><a href="#/skill/${encodeURIComponent(s.skill)}">Practise</a></td></tr>`).join('')
  }</tbody></table>`;
}

export function statusTag(id) {
  const rec = getEx(id);
  if (!rec) return '';
  const due = isDue(rec) ? ' <span class="tag due">Review due</span>' : '';
  if (rec.status === 'solved') return `<span class="tag ok">Solved</span>${due}`;
  if (rec.status === 'helped') return `<span class="tag warn">Solved with help</span>${due}`;
  if (rec.status === 'attempted') return '<span class="tag">Attempted</span>';
  return '';
}

/** Tick mark for exercise lists. */
export function statusMark(id) {
  const s = getEx(id)?.status;
  if (s === 'solved') return '<span class="mark ok" title="Solved">&#10003;</span>';
  if (s === 'helped') return '<span class="mark warn" title="Solved with help">&#10003;</span>';
  if (s === 'attempted') return '<span class="mark try" title="Attempted">&#8226;</span>';
  return '<span class="mark" title="Not started"></span>';
}
