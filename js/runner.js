// Talks to the Pyodide worker. One job at a time. Kills runs that take too long.
export const TIMEOUT_MS = 5000;
export const TIMEOUT_TEXT = 'Your code took too long. Check for an infinite loop.';

let worker = null;
let state = 'idle'; // idle | loading | ready | error
let job = null;
let timer = null;
let seq = 0;
const listeners = new Set();

function setState(next) {
  state = next;
  listeners.forEach((fn) => fn(state));
}

export function onStatus(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

export const pythonState = () => state;
export const busy = () => !!job;

function spawn() {
  worker = new Worker(new URL('../worker/pyworker.js', import.meta.url), { type: 'module' });
  setState('loading');
  worker.onmessage = onMessage;
  worker.onerror = () => {
    setState('error');
    if (job) finish({ failed: 'Python could not start. Reload the page and try again.' });
  };
}

/** Start loading Python in the background. Safe to call many times. */
export function warm() {
  if (!worker) spawn();
}

function finish(extra) {
  clearTimeout(timer);
  const j = job;
  job = null;
  j.resolve(j.kind === 'run' ? extra : { results: j.results, ...extra });
}

function onMessage(event) {
  const m = event.data;
  if (m.type === 'status') { setState(m.state); return; }
  if (!job || m.id !== job.id) return;
  if (m.type === 'start') {
    job.current = m.index;
    clearTimeout(timer);
    timer = setTimeout(onTimeout, TIMEOUT_MS);
  } else if (m.type === 'progress') {
    clearTimeout(timer);
    job.results[m.index] = m.result;
    job.onProgress?.(m.index, m.result);
  } else if (m.type === 'done') {
    finish(job.kind === 'run' ? (m.failed ? { failed: m.failed } : m.result) : { failed: m.failed });
  }
}

function onTimeout() {
  worker.terminate();
  spawn(); // fresh Python for the next run
  if (job.kind === 'tests') job.results[job.current] = { passed: false, timedOut: true };
  finish({ timedOut: true });
}

function start(kind, payload, onProgress) {
  warm();
  if (job) return Promise.resolve({ failed: 'Another run is still going.' });
  return new Promise((resolve) => {
    job = { id: ++seq, kind, resolve, results: [], onProgress };
    worker.postMessage({ id: job.id, kind, ...payload });
  });
}

/** Run code once. Resolves to { stdout, stderr, error, errorLine } or { timedOut } or { failed }. */
export function run({ code, stdin = '', files = null }) {
  return start('run', { code, stdin, files });
}

/** Run a list of tests. Resolves to { results: [...], timedOut?, failed? }. */
export function runTests({ code, files = null, tests }, onProgress) {
  return start('tests', { code, files, tests }, onProgress);
}
