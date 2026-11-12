// Optional accounts and sync through Firebase. Does nothing unless
// firebase-config.js is filled in. The Firebase SDK is only downloaded then.
//
// Firestore layout (each user can only touch their own tree):
//   users/{uid}/exercises/{exerciseId}
//   users/{uid}/notes/{lessonOrExerciseId}
//   users/{uid}/meta/main        lessons, activity days, settings
import { firebaseConfig } from '../firebase-config.js';
import * as store from './storage.js';
import { debounce, download, today } from './util.js';

export const syncEnabled = !!(firebaseConfig && firebaseConfig.apiKey);

const LABELS = {
  local: 'Local only',
  'signed-out': 'Local only',
  syncing: 'Syncing',
  synced: 'Synced',
  offline: 'Offline',
  error: 'Sync error',
};

const ERRORS = {
  'auth/invalid-credential': 'That email and password do not match an account.',
  'auth/wrong-password': 'That email and password do not match an account.',
  'auth/user-not-found': 'That email and password do not match an account.',
  'auth/invalid-email': 'That does not look like an email address.',
  'auth/missing-email': 'Type your email address first.',
  'auth/missing-password': 'Type a password.',
  'auth/email-already-in-use': 'There is already an account for that email. Use Sign in.',
  'auth/weak-password': 'Use a password with at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': 'No connection to the sign-in service. Check your network.',
  'auth/unauthorized-domain': 'This website address is not on the Authorised domains list in Firebase. See SETUP-SYNC.md, step 6.',
  'auth/operation-not-allowed': 'This sign-in method is not switched on in Firebase. See SETUP-SYNC.md, step 3.',
  'auth/account-exists-with-different-credential': 'This email already has an account with a different sign-in method. Use that method.',
};

function friendly(err) {
  return new Error(ERRORS[err?.code] || err?.message || 'Something went wrong.');
}

let state = syncEnabled ? 'signed-out' : 'local';
let fb = null;      // loaded SDK functions
let user = null;
let message = '';   // one-line note about the last sign-in or first sync
let running = false;
let again = false;
const listeners = new Set();

function set(next) {
  state = next;
  listeners.forEach((fn) => fn(LABELS[state], state));
}

/** fn(label, state) is called now and on every change: status, user or message. */
export function onSyncStatus(fn) {
  listeners.add(fn);
  fn(LABELS[state], state);
  return () => listeners.delete(fn);
}

export const syncUser = () => user;
export const syncMessage = () => message;

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

function hasLocalProgress() {
  return Object.keys(store.allEx()).length > 0
    || Object.values(store.allNotes()).some((n) => n.text && n.text.trim());
}

async function onUser(u) {
  user = u;
  if (!u) { set('signed-out'); return; }
  const firstSyncHere = store.syncState().uid !== u.uid;
  let backedUp = false;
  if (firstSyncHere) {
    // Safety first: keep a copy of what is on this device before anything merges.
    if (hasLocalProgress()) {
      download(`python-practice-backup-before-sync-${today()}.json`, JSON.stringify(store.exportAll(), null, 1), 'application/json');
      backedUp = true;
    }
    store.markAllDirty();
    store.setSyncUid(u.uid);
  }
  const result = await syncNow();
  if (firstSyncHere && result) {
    const n = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
    message = `${backedUp ? 'Backup file saved to your downloads. ' : ''}First sync on this device: uploaded ${n(result.pushedEx, 'exercise record')} and ${n(result.pushedNotes, 'note')}, received ${n(result.pulledEx, 'exercise record')} and ${n(result.pulledNotes, 'note')}.`;
    set(state);
  }
}

export async function initSync() {
  if (!syncEnabled) return;
  try {
    const sdk = await loadSdk();
    // Finishes a Google sign-in that used the redirect fallback.
    sdk.auth.getRedirectResult(sdk.authInstance).catch((err) => { message = friendly(err).message; set(state); });
    sdk.auth.onAuthStateChanged(sdk.authInstance, onUser);
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

// ---- signing in and out ----
const POPUP_BLOCKED = ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'];
const POPUP_CLOSED = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'];

/** Google sign-in. Uses a pop-up, and falls back to a full-page redirect if the pop-up is blocked. */
export async function signInGoogle() {
  const sdk = await loadSdk();
  const provider = new sdk.auth.GoogleAuthProvider();
  try {
    await sdk.auth.signInWithPopup(sdk.authInstance, provider);
  } catch (err) {
    if (POPUP_CLOSED.includes(err.code)) return;
    if (!POPUP_BLOCKED.includes(err.code)) throw friendly(err);
    try { await sdk.auth.signInWithRedirect(sdk.authInstance, provider); } catch (err2) { throw friendly(err2); }
  }
}

export async function signInEmail(email, password) {
  const sdk = await loadSdk();
  try { await sdk.auth.signInWithEmailAndPassword(sdk.authInstance, email.trim(), password); } catch (err) { throw friendly(err); }
}

export async function signUpEmail(email, password) {
  const sdk = await loadSdk();
  try { await sdk.auth.createUserWithEmailAndPassword(sdk.authInstance, email.trim(), password); } catch (err) { throw friendly(err); }
}

export async function resetPassword(email) {
  const sdk = await loadSdk();
  try { await sdk.auth.sendPasswordResetEmail(sdk.authInstance, email.trim()); } catch (err) { throw friendly(err); }
}

/** Signing out stops syncing. Everything stays saved in this browser. */
export async function signOutUser() {
  message = '';
  if (fb) await fb.auth.signOut(fb.authInstance);
}

// ---- pull and push ----
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
  const taken = store.mergeIn(incoming, { markDirty: false });
  store.setPulledAt(newest);
  return taken;
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
  return pushed;
}

/**
 * Pull newer records, then push local changes. Safe to call at any time.
 * Resolves to the counts moved, or null if nothing ran.
 */
export async function syncNow() {
  if (!syncEnabled || !user) return null;
  if (!navigator.onLine) { set('offline'); return null; }
  if (running) { again = true; return null; }
  running = true;
  set('syncing');
  let result = null;
  try {
    const taken = await pull();
    const pushed = await push();
    result = {
      pulledEx: taken.exercises, pulledNotes: taken.notes,
      pushedEx: Object.keys(pushed.ex).length, pushedNotes: Object.keys(pushed.notes).length,
    };
    set('synced');
  } catch (err) {
    console.warn('Sync failed', err);
    set(navigator.onLine ? 'error' : 'offline');
  } finally {
    running = false;
    if (again) { again = false; syncNow(); }
  }
  return result;
}
