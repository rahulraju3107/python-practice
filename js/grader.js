// Turns an exercise into a list of tests and grades a submission. No AI involved:
// tests are plain Python asserts or stdin/stdout comparisons.
import { runTests } from './runner.js';
import { normOut } from './util.js';

export function testList(ex) {
  return [
    ...(ex.tests || []).map((t) => ({ ...t, kind: 'assert' })),
    ...(ex.stdin_tests || []).map((t) => ({ ...t, kind: 'io' })),
  ];
}

export async function grade(ex, code, onProgress) {
  const tests = testList(ex);
  const out = await runTests({ code, files: ex.files || null, tests }, onProgress);
  const results = tests.map((t, i) => ({
    name: t.name, hidden: !!t.hidden, kind: t.kind,
    ...(out.results?.[i] || { passed: false, notRun: true }),
  }));
  const tp = results.filter((r) => r.passed).length;
  return { results, tp, tt: tests.length, passed: !out.failed && tp === tests.length, timedOut: !!out.timedOut, failed: out.failed };
}

export function gradePredict(ex, answer) {
  return normOut(answer) === normOut(ex.expected_output);
}
