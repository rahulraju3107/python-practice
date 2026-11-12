// CodeMirror 5 wrapper. CodeMirror is loaded as a global from /vendor.
const CM = window.CodeMirror;

function smartBackspace(cm) {
  const pos = cm.getCursor();
  const before = cm.getLine(pos.line).slice(0, pos.ch);
  if (cm.somethingSelected() || !before || before.trim() !== '' || pos.ch % 4 !== 0) return CM.Pass;
  cm.replaceRange('', { line: pos.line, ch: pos.ch - 4 }, pos);
  return undefined;
}

export function makeEditor(host, { value = '', readOnly = false, onChange = null } = {}) {
  const cm = CM(host, {
    value,
    mode: 'python',
    theme: 'pp',
    lineNumbers: true,
    indentUnit: 4,
    tabSize: 4,
    indentWithTabs: false,
    matchBrackets: true,
    autoCloseBrackets: true,
    readOnly,
    viewportMargin: Infinity,
    extraKeys: {
      Tab: (c) => (c.somethingSelected() ? c.indentSelection('add') : c.replaceSelection('    ', 'end')),
      'Shift-Tab': (c) => c.indentSelection('subtract'),
      Backspace: smartBackspace,
      'Ctrl-/': 'toggleComment',
      'Cmd-/': 'toggleComment',
    },
  });
  let marked = null;
  const clearError = () => {
    if (marked !== null) cm.removeLineClass(marked, 'background', 'cm-errline');
    marked = null;
  };
  cm.on('change', () => { clearError(); onChange?.(cm.getValue()); });
  return {
    cm,
    get value() { return cm.getValue(); },
    set value(v) { cm.setValue(v); },
    setReadOnly(flag) { cm.setOption('readOnly', flag); },
    clearError,
    /** Highlight a line from a traceback (1-based). */
    markError(line) {
      clearError();
      if (!line || line > cm.lineCount()) return;
      marked = cm.addLineClass(line - 1, 'background', 'cm-errline');
      cm.scrollIntoView({ line: line - 1, ch: 0 }, 60);
    },
    refresh() { cm.refresh(); },
    focus() { cm.focus(); },
  };
}

/** Colour every Python code block inside root. Unlabelled blocks stay plain. */
export function highlight(root) {
  root.querySelectorAll('pre > code[class*="language-py"]').forEach((code) => {
    if (code.dataset.done) return;
    code.dataset.done = '1';
    CM.runMode(code.textContent, 'python', code);
  });
}
