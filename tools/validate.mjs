// Optional command-line version of validate.html, for whoever writes new content.
// The learner never needs this. Nothing to install: it uses the Pyodide in /vendor.
//   node tools/validate.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPyodide } from '../vendor/pyodide/pyodide.mjs';
import { validateAll } from '../js/validate-core.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

const pyodide = await loadPyodide();
pyodide.runPython(fs.readFileSync(path.join(root, 'worker/harness.py'), 'utf8'));
const handle = pyodide.globals.get('handle');
// limit: seconds before a run is stopped, so an infinite loop cannot hang the check.
const exec = async (req) => JSON.parse(handle(JSON.stringify({ ...req, limit: 5 })));

const curriculum = readJson('content/curriculum.json');
const modules = curriculum.modules.map((m) => (m.file ? readJson('content/' + m.file) : null));
const { failures, counts } = await validateAll({ curriculum, modules, exec });

for (const f of failures) console.log(`FAIL ${f.id}: ${f.check}\n     ${f.detail}`);
const types = Object.entries(counts.byType).map(([k, v]) => `${v} ${k}`).join(', ');
console.log(`${failures.length} failures. ${counts.checks} checks, ${counts.lessons} lessons, ${counts.exercises} exercises (${types}).`);
process.exit(failures.length ? 1 : 0);
