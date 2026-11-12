// Pyodide web worker (module worker).
// Loads Pyodide from /vendor/pyodide first. Falls back to the CDN only if that fails.
const PYODIDE_VERSION = '314.0.7';
const SOURCES = [
  new URL('../vendor/pyodide/', self.location.href).href,
  `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`,
];

let handle = null;

async function boot() {
  let lastError;
  for (const base of SOURCES) {
    try {
      const mod = await import(base + 'pyodide.mjs');
      const pyodide = await mod.loadPyodide({ indexURL: base });
      const harness = await (await fetch(new URL('harness.py', self.location.href))).text();
      pyodide.runPython(harness);
      handle = pyodide.globals.get('handle');
      self.postMessage({ type: 'status', state: 'ready', source: base === SOURCES[0] ? 'local' : 'cdn' });
      return;
    } catch (err) {
      lastError = err;
    }
  }
  self.postMessage({ type: 'status', state: 'error', message: String(lastError) });
  throw lastError;
}

const ready = boot();

function call(req) {
  return JSON.parse(handle(JSON.stringify(req)));
}

self.onmessage = async (event) => {
  const { id, kind, code, stdin, files, tests } = event.data;
  try {
    await ready;
  } catch (err) {
    self.postMessage({ type: 'done', id, failed: String(err) });
    return;
  }
  if (kind === 'run') {
    self.postMessage({ type: 'start', id });
    self.postMessage({ type: 'done', id, result: call({ kind: 'run', code, stdin, files }) });
    return;
  }
  // kind === 'tests': one unit per test so the page can time each one.
  for (let i = 0; i < tests.length; i++) {
    self.postMessage({ type: 'start', id, index: i });
    const result = call({ kind: tests[i].kind, code, files, test: tests[i] });
    self.postMessage({ type: 'progress', id, index: i, result });
    // Let the page handle the message before the next test starts.
    await new Promise((r) => setTimeout(r, 0));
  }
  self.postMessage({ type: 'done', id });
};
