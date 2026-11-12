// Boot, hash router, header status and theme.
import { $, $$, esc } from './util.js';
import { loadContent, allExercises } from './content.js';
import { warm, onStatus } from './runner.js';
import { subscribe, getSetting, putSetting } from './storage.js';
import { dueExercises } from './progress.js';
import { initShortcuts, clearShortcuts } from './keys.js';
import { initSync, onSyncStatus, syncEnabled, syncUser, signOutUser } from './sync.js';
import { dashboard } from './views/dashboard.js';
import { learn } from './views/learn.js';
import { lessonPage } from './views/lesson.js';
import { exercisePage } from './views/exercise.js';
import { reviewPage } from './views/review.js';
import { timedPage } from './views/timed.js';
import { statsPage, skillPage } from './views/stats.js';
import { notesPage } from './views/notes.js';
import { referencePage } from './views/reference.js';
import { settingsPage } from './views/settings.js';

const routes = [
  [/^$/, dashboard, ''],
  [/^learn$/, learn, 'learn'],
  [/^lesson\/([\w-]+)$/, lessonPage, 'learn'],
  [/^ex\/([\w-]+)$/, (main, id) => exercisePage(main, id, 'practice'), 'learn'],
  [/^review$/, reviewPage, 'review'],
  [/^review\/([\w-]+)$/, (main, id) => exercisePage(main, id, 'review'), 'review'],
  [/^timed$/, timedPage, 'timed'],
  [/^progress$/, statsPage, 'progress'],
  [/^skill\/(.+)$/, (main, s) => skillPage(main, decodeURIComponent(s)), 'progress'],
  [/^notes$/, notesPage, 'notes'],
  [/^reference$/, referencePage, 'reference'],
  [/^settings$/, settingsPage, 'settings'],
];

const main = $('#app');
let cleanup = null;

function render() {
  const path = location.hash.replace(/^#\/?/, '').replace(/\/$/, '');
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  clearShortcuts();
  const hit = routes.find(([re]) => re.test(path));
  main.innerHTML = '';
  if (!hit) {
    main.innerHTML = '<div class="page"><h1>Page not found</h1><p><a href="#/">Go to the dashboard</a></p></div>';
  } else {
    const [re, view, navKey] = hit;
    $$('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.nav === navKey));
    cleanup = view(main, ...path.match(re).slice(1)) || null;
  }
  window.scrollTo(0, 0);
  updateDue();
}

function updateDue() {
  const n = dueExercises(allExercises()).length;
  const badge = $('#due-count');
  badge.hidden = n === 0;
  badge.textContent = n;
}

function applyTheme() {
  const choice = getSetting('theme', 'system');
  if (choice === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
  const dark = choice === 'dark' || (choice === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('#theme-toggle').textContent = dark ? 'Light theme' : 'Dark theme';
  $('#theme-toggle').onclick = () => putSetting('theme', dark ? 'light' : 'dark');
}

async function boot() {
  applyTheme();
  initShortcuts();
  subscribe((what) => {
    if (what === 'setting' || what === 'merge') applyTheme();
    updateDue();
  });
  onStatus((state) => {
    const text = { idle: 'Python: not loaded', loading: 'Loading Python...', ready: 'Python ready', error: 'Python failed to load' }[state];
    const chip = $('#py-status');
    chip.textContent = text;
    chip.dataset.state = state;
  });
  onSyncStatus((label, state) => {
    const chip = $('#sync-status');
    chip.textContent = label;
    chip.dataset.state = state;
    // Sign-in entry point, next to the sync status.
    const box = $('#account');
    const user = syncUser();
    if (!syncEnabled) {
      box.innerHTML = '<a class="muted small" href="#/settings">Accounts are not set up yet</a>';
    } else if (!user) {
      box.innerHTML = '<a class="btn small" href="#/settings">Sign in</a>';
    } else {
      box.innerHTML = `<span class="who small" title="${esc(user.email || '')}">${esc(user.email || 'Signed in')}</span><button type="button" class="btn small quiet">Sign out</button>`;
      $('button', box).onclick = () => signOutUser();
    }
  });
  try {
    await loadContent();
  } catch (err) {
    main.innerHTML = `<div class="page"><h1>Could not load the lessons</h1><p>${esc(err.message)}</p><p>Check your connection and reload the page.</p></div>`;
    return;
  }
  window.addEventListener('hashchange', render);
  render();
  warm(); // load Python once, in the background
  initSync();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
