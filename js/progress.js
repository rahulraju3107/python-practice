// Progress rules: attempts, "solved with help", spaced review, stats.
import { getEx, putEx, markDay, days } from './storage.js';
import { today, addDays } from './util.js';

// Days until the next review. First solve: 1 day. Then 3, 7, 14, 30.
export const INTERVALS = [1, 3, 7, 14, 30];

export function newRec(id) {
  return { id, status: 'new', firstTry: null, submits: 0, attempts: [], fails: 0, saw: false, hints: 0, stage: 0, due: null };
}

export function recOf(id) {
  return getEx(id) || newRec(id);
}

export const isDone = (rec) => !!rec && (rec.status === 'solved' || rec.status === 'helped');
export const isDue = (rec, day = today()) => isDone(rec) && !!rec.due && rec.due <= day;

/**
 * Record one submission and apply the review rules.
 * result: { passed, tp, tt, secs, code, mode }
 * Returns { rec, outcome } where outcome is one of
 * solved | helped | reviewed | practice | failed.
 */
export function recordAttempt(id, result) {
  const rec = recOf(id);
  const wasDue = isDue(rec);
  const helped = rec.saw;
  if (rec.firstTry === null) rec.firstTry = !!result.passed && !helped;
  rec.submits++;
  rec.attempts.push({
    ts: Date.now(), passed: !!result.passed, tp: result.tp, tt: result.tt,
    secs: result.secs, hints: rec.hints, saw: rec.saw, mode: result.mode, code: result.code,
  });

  let outcome;
  const tomorrow = addDays(today(), 1);
  if (result.passed) {
    if (helped) {
      Object.assign(rec, { status: 'helped', stage: 0, due: tomorrow });
      outcome = 'helped';
    } else if (!isDone(rec)) {
      Object.assign(rec, { status: 'solved', stage: 0, due: tomorrow });
      outcome = 'solved';
    } else if (wasDue) {
      rec.stage = Math.min(rec.stage + 1, INTERVALS.length - 1);
      rec.due = addDays(today(), INTERVALS[rec.stage]);
      rec.status = 'solved';
      outcome = 'reviewed';
    } else {
      outcome = 'practice';
    }
    Object.assign(rec, { fails: 0, saw: false, hints: 0 });
  } else {
    rec.fails++;
    if (rec.status === 'new') rec.status = 'attempted';
    if (wasDue) Object.assign(rec, { stage: 0, due: tomorrow }); // failed review
    outcome = 'failed';
  }
  putEx(rec);
  markDay();
  return { rec, outcome };
}

/** End the current try as "Solved with help": back in the review queue tomorrow. */
export function settleHelped(id) {
  const rec = recOf(id);
  Object.assign(rec, { status: 'helped', stage: 0, due: addDays(today(), 1), fails: 0, saw: false, hints: 0 });
  putEx(rec);
  return rec;
}

export function markSawSolution(id) {
  const rec = recOf(id);
  if (rec.status === 'new') rec.status = 'attempted';
  rec.saw = true;
  putEx(rec);
  return rec;
}

export function useHint(id, count) {
  const rec = recOf(id);
  if (rec.status === 'new') rec.status = 'attempted';
  rec.hints = Math.max(rec.hints || 0, count);
  putEx(rec);
  return rec;
}

export function saveApproach(id, text) {
  const rec = getEx(id);
  if (!rec || !rec.attempts.length) return;
  rec.attempts[rec.attempts.length - 1].approach = text;
  putEx(rec);
}

/** Is the reference solution open to view without counting as help? */
export function solutionFree(rec) {
  return isDone(rec) && !isDue(rec);
}

// ---- summaries ----
export function countDone(exercises) {
  let done = 0, helped = 0;
  for (const ex of exercises) {
    const rec = getEx(ex.id);
    if (isDone(rec)) done++;
    if (rec?.status === 'helped') helped++;
  }
  return { done, helped, total: exercises.length };
}

export function dueExercises(exercises, day = today()) {
  return exercises
    .filter((ex) => isDue(getEx(ex.id), day))
    .sort((a, b) => getEx(a.id).due.localeCompare(getEx(b.id).due));
}

/**
 * Per-skill numbers. First-try pass rate = of the exercises tried,
 * the share whose very first submission passed. Weakest first.
 */
export function skillStats(exercises) {
  const map = new Map();
  for (const ex of exercises) {
    const rec = getEx(ex.id);
    if (!rec || !rec.submits) continue;
    for (const skill of ex.skills || []) {
      if (!map.has(skill)) map.set(skill, { skill, tried: 0, attempts: 0, first: 0, helped: 0 });
      const m = map.get(skill);
      m.tried++;
      m.attempts += rec.submits;
      if (rec.firstTry) m.first++;
      if (rec.status === 'helped') m.helped++;
    }
  }
  return [...map.values()]
    .map((m) => ({ ...m, rate: m.first / m.tried }))
    .sort((a, b) => a.rate - b.rate || b.helped - a.helped || b.attempts - a.attempts);
}

/** Days practised in a row, ending today (or yesterday if today has no practice yet). */
export function streak() {
  const d = days();
  let day = today();
  if (!d[day]) day = addDays(day, -1);
  let n = 0;
  while (d[day]) { n++; day = addDays(day, -1); }
  return n;
}
