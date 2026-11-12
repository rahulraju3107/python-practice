// The quality gate. Used by validate.html (browser) and tools/validate.mjs (Node).
// It needs one function, exec(request) -> result, that runs a request through
// worker/harness.py. Everything else is plain data checks.

const TYPES = ['write', 'fix', 'predict', 'explain'];
const TIERS = ['warmup', 'core', 'stretch'];

function norm(text) {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/\s+$/, ''));
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

const filled = (v) => typeof v === 'string' && v.trim() !== '';

export async function validateAll({ curriculum, modules, exec, onProgress = () => {} }) {
  const failures = [];
  const counts = { checks: 0, lessons: 0, exercises: 0, byType: {} };
  const seen = new Set();

  const check = (cond, id, name, detail = '') => {
    counts.checks++;
    if (!cond) failures.push({ id, check: name, detail: String(detail).slice(0, 600) });
    return !!cond;
  };

  async function runTest(code, files, test, kind) {
    const r = await exec({ kind, code, files: files || null, test });
    return r || { passed: false, internal: 'no result' };
  }

  async function allTests(ex, code) {
    const out = [];
    for (const t of ex.tests || []) out.push({ t, r: await runTest(code, ex.files, t, 'assert') });
    for (const t of ex.stdin_tests || []) out.push({ t, r: await runTest(code, ex.files, t, 'io') });
    return out;
  }

  const describe = ({ t, r }) => `test "${t.name}": expected ${r.expected ?? ''} | got ${r.actual ?? ''} ${r.timedOut ? '(took too long)' : ''} ${r.error || r.internal || ''}`;

  async function validateExercise(ex, lesson) {
    const id = ex.id || `${lesson.id}-??`;
    counts.exercises++;
    counts.byType[ex.type] = (counts.byType[ex.type] || 0) + 1;
    onProgress(id);
    check(new RegExp(`^${lesson.id}-e\\d\\d$`).test(id), id, 'ID format', 'must look like m01-l02-e05 and start with the lesson ID');
    check(!seen.has(id), id, 'ID is unique');
    seen.add(id);
    check(TYPES.includes(ex.type), id, 'type is valid', ex.type);
    check(TIERS.includes(ex.tier), id, 'tier is valid', ex.tier);
    check(filled(ex.title), id, 'has a title');
    check(filled(ex.prompt), id, 'has a prompt');
    check(Array.isArray(ex.skills) && ex.skills.length > 0, id, 'has at least one skill');
    check(!ex.hints || ex.hints.length <= 3, id, 'at most three hints');

    if (ex.type === 'write' || ex.type === 'fix') {
      const tests = [...(ex.tests || []), ...(ex.stdin_tests || [])];
      check(tests.some((t) => !t.hidden), id, 'has a visible test');
      check(tests.some((t) => t.edge), id, 'has an edge-case test', 'mark at least one test with "edge": true');
      check(tests.every((t) => filled(t.name)), id, 'every test has a name');
      check((ex.hints || []).length >= 1, id, 'has at least one hint');
      check(typeof ex.starter_code === 'string', id, 'has starter_code');
      check(filled(ex.solution), id, 'has a solution');
      check(filled(ex.solution_explanation), id, 'has a solution_explanation');
      if (ex.type === 'fix') check((ex.skills || []).includes('debugging'), id, 'fix exercises list the "debugging" skill');
      if (filled(ex.solution) && tests.length) {
        const sol = await allTests(ex, ex.solution);
        const bad = sol.filter((x) => !x.r.passed);
        check(bad.length === 0, id, 'solution passes every test', bad.map(describe).join(' || '));
        const start = await allTests(ex, ex.starter_code || '');
        check(start.some((x) => !x.r.passed), id,
          ex.type === 'fix' ? 'broken starter code fails at least one test' : 'starter code does not already pass');
      }
    } else if (ex.type === 'predict') {
      check(filled(ex.starter_code), id, 'has the code to read in starter_code');
      check(typeof ex.expected_output === 'string', id, 'has expected_output');
      check(filled(ex.solution_explanation), id, 'has a solution_explanation');
      const r = await exec({ kind: 'run', code: ex.starter_code || '', stdin: '', files: ex.files || null });
      check(!r.error && !r.timedOut, id, 'code runs without an error', r.error || '');
      check(norm(r.stdout) === norm(ex.expected_output), id, 'expected_output matches the real output', `real output: ${JSON.stringify(r.stdout)}`);
    } else if (ex.type === 'explain') {
      check((ex.skills || []).includes('explaining'), id, 'explain exercises list the "explaining" skill');
      check(filled(ex.starter_code), id, 'has the code to explain in starter_code');
      check(filled(ex.model_explanation), id, 'has a model_explanation');
      check(Array.isArray(ex.checklist) && ex.checklist.length >= 2, id, 'has a checklist of at least two items');
      const r = await exec({ kind: 'run', code: ex.starter_code || '', stdin: ex.stdin || '', files: ex.files || null });
      check(!r.error && !r.timedOut, id, 'code runs without an error', r.error || '');
    }
  }

  async function validateLesson(lesson, isFirst) {
    const id = lesson.id;
    counts.lessons++;
    onProgress(id);
    for (const field of ['title', 'what', 'why', 'syntax', 'remember']) check(filled(lesson[field]), id, `lesson has "${field}"`);
    if (!isFirst) check(filled(lesson.recap), id, 'lesson has "recap"');
    const ex = lesson.examples || [];
    check(ex.length >= 2 && ex.length <= 4, id, 'two to four worked examples', ex.length);
    for (const [i, e] of ex.entries()) {
      const r = await exec({ kind: 'run', code: e.code, stdin: e.stdin || '' });
      check(!r.error && norm(r.stdout) === norm(e.output), id, `example ${i + 1} output matches`, r.error || `real output: ${JSON.stringify(r.stdout)}`);
      check(filled(e.explain), id, `example ${i + 1} has an explanation`);
    }
    check((lesson.mistakes || []).length >= 1, id, 'has common mistakes');
    for (const [i, m] of (lesson.mistakes || []).entries()) {
      check(filled(m.title) && filled(m.fix), id, `mistake ${i + 1} has a title and a fix`);
      if (!m.code || m.run === false) continue;
      const r = await exec({ kind: 'run', code: m.code, stdin: m.stdin || '' });
      if (m.error) check(norm(r.error || '') === norm(m.error), id, `mistake ${i + 1} shows the real error message`, `real error: ${JSON.stringify(r.error)}`);
      else check(!r.error, id, `mistake ${i + 1} runs (no error text was given)`, r.error || '');
    }
    const qc = lesson.quick_checks || [];
    check(qc.length >= 1 && qc.length <= 2, id, 'one or two quick checks', qc.length);
    for (const [i, q] of qc.entries()) {
      const r = await exec({ kind: 'run', code: q.code, stdin: '' });
      check(!r.error && norm(r.stdout) === norm(q.expected_output), id, `quick check ${i + 1} output matches`, r.error || `real output: ${JSON.stringify(r.stdout)}`);
    }
    check((lesson.reference || []).length >= 1, id, 'has quick reference entries');
    for (const r of lesson.reference || []) check(filled(r.concept) && filled(r.syntax) && filled(r.example), id, 'reference entry is complete', r.concept);
    const list = lesson.exercises || [];
    check(list.length >= 8, id, 'at least 8 exercises', list.length);
    const order = list.map((e) => TIERS.indexOf(e.tier));
    check(order.every((t, i) => i === 0 || t >= order[i - 1]), id, 'exercises go warm-up, core, stretch');
    for (const tier of TIERS) check(list.some((e) => e.tier === tier), id, `has a ${tier} exercise`);
    for (const e of list) await validateExercise(e, lesson);
  }

  const moduleIds = new Set();
  let first = true;
  for (const [i, entry] of curriculum.modules.entries()) {
    check(/^m\d\d$/.test(entry.id) && !moduleIds.has(entry.id), entry.id, 'module ID is valid and unique');
    moduleIds.add(entry.id);
    check(filled(entry.title) && Array.isArray(entry.lessons) && entry.lessons.length > 0, entry.id, 'module has a title and lessons');
    for (const l of entry.lessons || []) check(String(l.id).startsWith(entry.id + '-l') && filled(l.title), l.id, 'lesson entry is valid');
    const data = modules[i];
    if (!entry.file) continue;
    if (!check(!!data, entry.id, 'module file loads', entry.file)) continue;
    check(data.id === entry.id, entry.id, 'module file ID matches curriculum.json');
    const want = entry.lessons.map((l) => `${l.id}|${l.title}`).join('\n');
    const have = (data.lessons || []).map((l) => `${l.id}|${l.title}`).join('\n');
    check(want === have, entry.id, 'lessons match curriculum.json (same IDs, titles and order)', `curriculum: ${want} || file: ${have}`);
    for (const lesson of data.lessons || []) {
      await validateLesson(lesson, first);
      first = false;
    }
  }
  return { failures, counts };
}
