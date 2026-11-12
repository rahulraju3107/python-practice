# Python side of the runner. Loaded once into Pyodide by worker/pyworker.js
# (and by tools/validate.mjs). The only entry point is handle(request_json).
import ast
import builtins
import io
import json
import linecache
import operator
import os
import random
import shutil
import sys
import time
import traceback

WORK = '/home/pyodide/work'
MAIN = 'main.py'
_builtin_input = builtins.input


class OutputLimit(BaseException):
    pass


class TimeLimit(BaseException):
    pass


def _tracer_until(deadline):
    """Optional time limit, used by the content checker. The web page does not
    need it: it stops slow code by restarting the whole worker."""
    def tracer(frame, event, arg):
        if frame.f_code.co_filename in (MAIN, '<test>'):
            if time.monotonic() > deadline:
                raise TimeLimit()
            return tracer
        return None
    return tracer


class _Out(io.StringIO):
    LIMIT = 200000

    def write(self, s):
        s = str(s)
        room = self.LIMIT - self.tell()
        if len(s) > room:
            super().write(s[:max(room, 0)])
            raise OutputLimit()
        return super().write(s)


def _norm(text):
    """Ignore trailing spaces on each line and trailing blank lines."""
    lines = [ln.rstrip() for ln in str(text).replace('\r\n', '\n').split('\n')]
    while lines and lines[-1] == '':
        lines.pop()
    return '\n'.join(lines)


def _prepare(files):
    """Fresh working folder, fresh files, no left-over learner modules."""
    os.chdir('/')
    shutil.rmtree(WORK, ignore_errors=True)
    os.makedirs(WORK)
    os.chdir(WORK)
    for name, text in (files or {}).items():
        folder = os.path.dirname(name)
        if folder:
            os.makedirs(folder, exist_ok=True)
        with open(name, 'w', encoding='utf-8', newline='') as f:
            f.write(text)
    for name, mod in list(sys.modules.items()):
        if str(getattr(mod, '__file__', None) or '').startswith(WORK):
            del sys.modules[name]
    if WORK not in sys.path:
        sys.path.insert(0, WORK)
    random.seed()


def _describe(exc):
    """Return (traceback text, line number) showing only the learner's code."""
    if isinstance(exc, OutputLimit):
        return ('Your code printed too much output. Check for a loop that never ends.', None)
    if isinstance(exc, TimeLimit):
        return ('Your code took too long. Check for an infinite loop.', None)
    if isinstance(exc, SyntaxError) and exc.filename == MAIN:
        text = ''.join(traceback.format_exception_only(type(exc), exc))
        return (text.rstrip(), exc.lineno)
    frames = [f for f in traceback.extract_tb(exc.__traceback__) if f.filename == MAIN]
    text = ''
    if frames:
        text = 'Traceback (most recent call last):\n'
        text += ''.join(traceback.StackSummary.from_list(frames).format())
    text += ''.join(traceback.format_exception_only(type(exc), exc))
    return (text.rstrip(), frames[-1].lineno if frames else None)


class _Redirect:
    def __init__(self, out, err, src, echo):
        self.out, self.err, self.src, self.echo = out, err, src, echo

    def _input(self, prompt=''):
        if self.echo:
            self.out.write(str(prompt))
        line = self.src.readline()
        if line == '':
            raise EOFError('input() was called but there was no more input to read')
        line = line.rstrip('\r\n')
        if self.echo:
            self.out.write(line + '\n')
        return line

    def __enter__(self):
        self.saved = (sys.stdout, sys.stderr, sys.stdin)
        sys.stdout, sys.stderr, sys.stdin = self.out, self.err, self.src
        builtins.input = self._input

    def __exit__(self, *args):
        sys.stdout, sys.stderr, sys.stdin = self.saved
        builtins.input = _builtin_input


def _execute(code, stdin, files, echo):
    _prepare(files)
    out, err = _Out(), _Out()
    ns = {'__name__': '__main__', '__builtins__': builtins}
    error = line = None
    with _Redirect(out, err, io.StringIO(stdin or ''), echo):
        try:
            linecache.cache[MAIN] = (len(code), None, code.splitlines(True), MAIN)
            exec(compile(code, MAIN, 'exec'), ns)
        except SystemExit:
            pass
        except BaseException as exc:
            error, line = _describe(exc)
    return ns, out.getvalue(), err.getvalue(), error, line


def _printed(func, *args, **kwargs):
    """Test helper: call func and return what it printed (normalised)."""
    out = _Out()
    saved = sys.stdout
    sys.stdout = out
    try:
        func(*args, **kwargs)
    finally:
        sys.stdout = saved
    return _norm(out.getvalue())


_OPS = {
    ast.Eq: (operator.eq, ''),
    ast.NotEq: (operator.ne, 'anything except '),
    ast.Lt: (operator.lt, 'less than '),
    ast.LtE: (operator.le, 'at most '),
    ast.Gt: (operator.gt, 'more than '),
    ast.GtE: (operator.ge, 'at least '),
    ast.Is: (operator.is_, ''),
    ast.IsNot: (operator.is_not, 'anything except '),
    ast.In: (lambda a, b: a in b, 'one of '),
    ast.NotIn: (lambda a, b: a not in b, 'not one of '),
}


def _eval(node, ns):
    return eval(compile(ast.Expression(node), '<test>', 'eval'), ns)


def _check(test_src, ns):
    """Run one assert-style test. Returns None on a pass, or a dict on a fail."""
    tree = ast.parse(test_src, '<test>')
    for node in tree.body:
        if not isinstance(node, ast.Assert):
            exec(compile(ast.Module([node], []), '<test>', 'exec'), ns)
            continue
        cond = node.test
        if isinstance(cond, ast.Compare) and len(cond.ops) == 1 and type(cond.ops[0]) in _OPS:
            fn, word = _OPS[type(cond.ops[0])]
            shown = ast.unparse(cond.left)
            right = _eval(cond.comparators[0], ns)
            expected = word + repr(right)
            try:
                left = _eval(cond.left, ns)
            except Exception as exc:
                text, line = _describe(exc)
                return {'input': shown, 'expected': expected,
                        'actual': f'{type(exc).__name__}: {exc}',
                        'error': text, 'errorLine': line}
            if fn(left, right):
                continue
            fail = {'input': shown, 'expected': expected, 'actual': repr(left)}
        else:
            value = _eval(cond, ns)
            if value:
                continue
            fail = {'input': ast.unparse(cond), 'expected': 'True', 'actual': repr(value)}
        if node.msg is not None:
            fail['message'] = str(_eval(node.msg, ns))
        return fail
    return None


def _run_io_test(code, files, test):
    stdin = test.get('stdin', '')
    ns, out, err, error, line = _execute(code, stdin, files, False)
    actual, expected = _norm(out), _norm(test['expected_stdout'])
    return {'kind': 'io', 'passed': error is None and actual == expected,
            'input': stdin, 'expected': expected, 'actual': actual,
            'error': error, 'errorLine': line}


def _run_assert_test(code, files, test):
    res = {'kind': 'assert', 'passed': False, 'input': test['code']}
    ns, out, err, error, line = _execute(code, test.get('stdin', ''), files, False)
    if error is not None:
        res.update(expected='your code to run without an error',
                   actual=error.splitlines()[-1], error=error, errorLine=line)
        return res
    ns['_stdout'] = _norm(out)
    ns['printed'] = _printed
    with _Redirect(_Out(), _Out(), io.StringIO(''), False):
        try:
            fail = _check(test['code'], ns)
        except BaseException as exc:
            text, line = _describe(exc)
            fail = {'expected': 'the test to run without an error',
                    'actual': f'{type(exc).__name__}: {exc}',
                    'error': text, 'errorLine': line}
    if fail is None:
        res['passed'] = True
    else:
        res.update(fail)
    return res


def handle(request_json):
    req = json.loads(request_json)
    kind, code, files = req['kind'], req.get('code', ''), req.get('files')
    if req.get('limit'):
        sys.settrace(_tracer_until(time.monotonic() + req['limit']))
    try:
        if kind == 'run':
            ns, out, err, error, line = _execute(code, req.get('stdin', ''), files, True)
            res = {'stdout': out, 'stderr': err, 'error': error, 'errorLine': line}
        elif kind == 'io':
            res = _run_io_test(code, files, req['test'])
        elif kind == 'assert':
            res = _run_assert_test(code, files, req['test'])
        else:
            res = {'internal': f'unknown request kind {kind!r}'}
    except BaseException as exc:
        res = {'passed': False, 'internal': f'{type(exc).__name__}: {exc}'}
    finally:
        sys.settrace(None)
    return json.dumps(res)
