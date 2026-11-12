// All persistence lives here. Nothing else in the app touches localStorage.
//
// Data shape (one JSON object):
//   exercises: { [exerciseId]: record }     merged per exercise by updated_at
//   notes:     { [lessonOrExerciseId]: { text, updated_at } }   merged per note
//   lessons:   { [lessonId]: { quick: {}, updated_at } }
//   days:      { 'YYYY-MM-DD': submissions }  merged per day, larger count wins
//   settings:  { theme, updated_at }
import { today } from './util.js';

const KEYS = { db: 'pp.v1', drafts: 'pp.drafts.v1', sync: 'pp.sync.v1' };
const MAX_ATTEMPTS = 30;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function blank() {
  return { version: 1, exercises: {}, notes: {}, lessons: {}, days: {}, settings: {} };
}

const db = Object.assign(blank(), read(KEYS.db, {}));
const drafts = read(KEYS.drafts, {});
const sync = Object.assign({ dirtyEx: [], dirtyNotes: [], dirtyMeta: false, pulledAt: 0 }, read(KEYS.sync, {}));
const listeners = new Set();

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function persist() {
  if (write(KEYS.db, db)) return;
  // Storage is full. Drop the saved code from older attempts and try again.
  for (const rec of Object.values(db.exercises)) {
    (rec.attempts || []).slice(0, -3).forEach((a) => { a.code = ''; });
  }
  write(KEYS.db, db);
}

function commit(what, markDirty = true) {
  persist();
  if (markDirty) write(KEYS.sync, sync);
  listeners.forEach((fn) => fn(what));
}

function dirty(list, id) {
  if (!sync[list].includes(id)) sync[list].push(id);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---- exercises ----
export function getEx(id) {
  return db.exercises[id] || null;
}

export function allEx() {
  return db.exercises;
}

export function putEx(rec) {
  rec.updated_at = Date.now();
  if (rec.attempts && rec.attempts.length > MAX_ATTEMPTS) rec.attempts = rec.attempts.slice(-MAX_ATTEMPTS);
  db.exercises[rec.id] = rec;
  dirty('dirtyEx', rec.id);
  commit('exercise');
}

// ---- notes ----
export function getNote(key) {
  return db.notes[key]?.text || '';
}

export function putNote(key, text) {
  if ((db.notes[key]?.text || '') === text) return;
  db.notes[key] = { text, updated_at: Date.now() };
  dirty('dirtyNotes', key);
  commit('note');
}

export function allNotes() {
  return db.notes;
}

// ---- lessons, activity, settings ----
export function getLesson(id) {
  return db.lessons[id] || { quick: {} };
}

export function putLesson(id, rec) {
  db.lessons[id] = { ...rec, updated_at: Date.now() };
  sync.dirtyMeta = true;
  commit('lesson');
}

export function days() {
  return db.days;
}

export function markDay() {
  const d = today();
  db.days[d] = (db.days[d] || 0) + 1;
  sync.dirtyMeta = true;
  commit('day');
}

export function getSetting(key, fallback = null) {
  return db.settings[key] ?? fallback;
}

export function putSetting(key, value) {
  db.settings[key] = value;
  db.settings.updated_at = Date.now();
  sync.dirtyMeta = true;
  commit('setting');
}

// ---- drafts: unsubmitted editor contents. This device only. ----
export function getDraft(id) {
  return drafts[id] ?? null;
}

export function putDraft(id, code) {
  if (code === null) delete drafts[id]; else drafts[id] = code;
  write(KEYS.drafts, drafts);
}

// ---- export, import, merge ----
export function exportAll() {
  return { app: 'python-practice', version: 1, exported_at: new Date().toISOString(), data: db };
}

/**
 * Merge another copy of the data into this one. The newer record wins,
 * per exercise and per note. Returns how many records were taken.
 * markDirty: true for a file import (so it is pushed to sync later),
 * false when the data came from sync itself.
 */
export function mergeIn(incoming, { markDirty = true } = {}) {
  const src = incoming?.data || incoming || {};
  const taken = { exercises: 0, notes: 0 };
  const newer = (theirs, mine) => theirs && (!mine || (theirs.updated_at || 0) > (mine.updated_at || 0));

  for (const [id, rec] of Object.entries(src.exercises || {})) {
    if (newer(rec, db.exercises[id])) {
      db.exercises[id] = rec;
      taken.exercises++;
      if (markDirty) dirty('dirtyEx', id);
    }
  }
  for (const [key, note] of Object.entries(src.notes || {})) {
    if (newer(note, db.notes[key])) {
      db.notes[key] = note;
      taken.notes++;
      if (markDirty) dirty('dirtyNotes', key);
    }
  }
  for (const [id, rec] of Object.entries(src.lessons || {})) {
    if (newer(rec, db.lessons[id])) db.lessons[id] = rec;
  }
  for (const [day, count] of Object.entries(src.days || {})) {
    db.days[day] = Math.max(db.days[day] || 0, count || 0);
  }
  if (newer(src.settings, db.settings)) db.settings = src.settings;
  if (markDirty) sync.dirtyMeta = true;
  persist();
  write(KEYS.sync, sync);
  listeners.forEach((fn) => fn('merge'));
  return taken;
}

// ---- used by js/sync.js only ----
export function syncMeta() {
  return { lessons: db.lessons, days: db.days, settings: db.settings };
}

export function syncState() {
  return sync;
}

/** Called after a successful push. pushed = { ex: {id: updated_at}, notes: {...}, meta: bool } */
export function clearDirty(pushed) {
  sync.dirtyEx = sync.dirtyEx.filter((id) => db.exercises[id]?.updated_at !== pushed.ex[id]);
  sync.dirtyNotes = sync.dirtyNotes.filter((k) => db.notes[k]?.updated_at !== pushed.notes[k]);
  if (pushed.meta) sync.dirtyMeta = false;
  write(KEYS.sync, sync);
}

export function setPulledAt(ts) {
  sync.pulledAt = ts;
  write(KEYS.sync, sync);
}

/** Remember which account this device last synced with. Stays on this device. */
export function setSyncUid(uid) {
  sync.uid = uid;
  write(KEYS.sync, sync);
}

/** A new sign-in must send everything, not just recent changes. */
export function markAllDirty() {
  sync.dirtyEx = Object.keys(db.exercises);
  sync.dirtyNotes = Object.keys(db.notes);
  sync.dirtyMeta = true;
  sync.pulledAt = 0;
  write(KEYS.sync, sync);
}
