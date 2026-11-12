// Keyboard shortcuts. Views register what Run, Submit and Save mean on their page.
const handlers = { run: null, submit: null, save: null };

export function setShortcuts(next) {
  Object.assign(handlers, next);
}

export function clearShortcuts() {
  handlers.run = handlers.submit = handlers.save = null;
}

export function initShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    let name = null;
    if (e.key === 'Enter') name = e.shiftKey ? 'submit' : 'run';
    else if (e.key.toLowerCase() === 's' && !e.shiftKey) name = 'save';
    if (!name) return;
    if (name === 'save' || handlers[name]) e.preventDefault();
    if (handlers[name]) { e.stopPropagation(); handlers[name](); }
  }, true);
}
