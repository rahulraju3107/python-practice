// Optional Firebase sync. Does nothing unless firebase-config.js is filled in.
// The Firebase SDK is only downloaded when sync is enabled.
//
// Firestore layout (each user can only touch their own tree):
//   users/{uid}/exercises/{exerciseId}
//   users/{uid}/notes/{lessonOrExerciseId}
//   users/{uid}/meta/main        lessons, activity days, settings
import { firebaseConfig } from '../firebase-config.js';
import * as store from './storage.js';
import { debounce } from './util.js';

export const syncEnabled = !!(firebaseConfig && firebaseConfig.apiKey);

const LABELS = {
  local: 'Local only',
  'signed-out': 'Local only',
  syncing: 'Syncing',
  synced: 'Synced',
  offline: 'Offline',
  error: 'Sync error',
};

let state = syncEnabled ? 'signed-out' : 'local';
let fb = null;      // loaded SDK functions
let user = null;
let running = false;
let again = false;
const listeners = new Set();

function set(next) {
  state = next;
  listeners.forEach((fn) => fn(LABELS[state], state));
}

export function onSyncStatus(fn) {
  listeners.add(fn);
  fn(LABELS[state], state);
  return () => listeners.delete(fn);
}

export const syncUser = () => user;
export const syncStateNow = () => state;

async function loadSdk() {
  if (fb) return fb;
  const base = new URL('../vendor/firebase/', import.meta.url).href;
  const [app, auth, fs] = await Promise.all([
    import(base + 'firebase-app.js'),
    import(base + 'firebase-auth.js'),
    import(base + 'firebase-firestore-lite.js'),
  ]);
  const instance = app.initializeApp(firebaseConfig);
  fb = { auth, fs, authInstance: auth.getAuth(instance), db: fs.getFirestore(instance) };
  return fb;
}

export async function initSync() {
  if (!syncEnabled) return;
  try {
    const sdk = await loadSdk();
    sdk.auth.onAuthStateChanged(sdk.authInstance, (u) => {
      const changed = (u?.uid || null) !== (store.getSetting('sync_uid') || null);
      user = u;
      if (!u) { set('signed-out'); return; }
      if (changed) { store.markAllDirty(); store.putSetting('sync_uid', u.uid); }
      syncNow();
    });
  } catch (err) {
    console.warn('Sync could not start', err);
    set(navigator.onLine ? 'error' : 'offline');
  }
  window.addEventListener('online', () => syncNow());
  window.addEventListener('offline', () => { if (user) set('offline'); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(); });
  const later = debounce(() => syncNow(), 4000);
  store.subscribe((what) => { if (what !== 'merge') later(); });
}

export async function signIn() {
  const sdk = await loadSdk();
  await sdk.auth.signInWithPopup(sdk.authInstance, new sdk.auth.GoogleAuthProvider());
}

export async function signOutUser() {
  if (fb) await fb.auth.signOut(fb.authInstance);
}

async function pull() {
  const { fs, db } = fb;
  const since = store.syncState().pulledAt || 0;
  const incoming = { exercises: {}, notes: {} };
  let newest = since;
  for (const name of ['exercises', 'notes']) {
    const q = fs.query(fs.collection(db, 'users', user.uid, name), fs.where('updated_at', '>', since));
    const snap = await fs.getDocs(q);
    snap.forEach((d) => {
      incoming[name][d.id] = d.data();
      newest = Math.max(newest, d.data().updated_at || 0);
    });
  }
  const meta = await fs.getDoc(fs.doc(db, 'users', user.uid, 'meta', 'main'));
  if (meta.exists()) Object.assign(incoming, meta.data());
  store.mergeIn(incoming, { markDirty: false });
  store.setPulledAt(newest);
}

async function push() {
  const { fs, db } = fb;
  const s = store.syncState();
  const pushed = { ex: {}, notes: {}, meta: false };
  const writes = [];
  for (const id of s.dirtyEx) {
    const rec = store.getEx(id);
    if (rec) { writes.push([fs.doc(db, 'users', user.uid, 'exercises', id), rec]); pushed.ex[id] = rec.updated_at; }
  }
  const notes = store.allNotes();
  for (const key of s.dirtyNotes) {
    if (notes[key]) { writes.push([fs.doc(db, 'users', user.uid, 'notes', key), notes[key]]); pushed.notes[key] = notes[key].updated_at; }
  }
  if (s.dirtyMeta) {
    writes.push([fs.doc(db, 'users', user.uid, 'meta', 'main'), store.syncMeta()]);
    pushed.meta = true;
  }
  for (let i = 0; i < writes.length; i += 400) {
    const batch = fs.writeBatch(db);
    writes.slice(i, i + 400).forEach(([ref, data]) => batch.set(ref, JSON.parse(JSON.stringify(data))));
    await batch.commit();
  }
  store.clearDirty(pushed);
}

/** Pull newer records, then push local changes. Safe to call at any time. */
export async function syncNow() {
  if (!syncEnabled || !user) return;
  if (!navigator.onLine) { set('offline'); return; }
  if (running) { again = true; return; }
  running = true;
  set('syncing');
  try {
    await pull();
    await push();
    set('synced');
  } catch (err) {
    console.warn('Sync failed', err);
    set(navigator.onLine ? 'error' : 'offline');
  } finally {
    running = false;
    if (again) { again = false; syncNow(); }
  }
}
