// Settings: theme, backup (export and import), sync, shortcuts.
import { $, $$, esc, download, today } from '../util.js';
import { getSetting, putSetting, exportAll, mergeIn } from '../storage.js';
import { syncEnabled, onSyncStatus, syncUser, signIn, signOutUser, syncNow } from '../sync.js';

export function settingsPage(main) {
  const theme = getSetting('theme', 'system');
  main.innerHTML = `<div class="page">
    <h1>Settings</h1>

    <section><h2>Theme</h2>
      <div class="checks">${['system', 'light', 'dark'].map((t) => `<label><input type="radio" name="theme" value="${t}" ${t === theme ? 'checked' : ''}> ${t === 'system' ? 'Match my device' : t[0].toUpperCase() + t.slice(1)}</label>`).join('')}</div>
    </section>

    <section><h2>Backup and moving between devices</h2>
      <p>Your progress and notes are saved in this browser. Export them to one file, then import that file on another device. Import merges: for each exercise and note, the newer copy wins.</p>
      <div class="toolbar">
        <button type="button" class="btn" data-export>Export progress and notes</button>
        <label class="btn">Import a backup file<input type="file" accept="application/json,.json" data-import hidden></label>
      </div>
      <p data-import-result aria-live="polite"></p>
    </section>

    <section><h2>Sync</h2>
      ${syncEnabled ? `<p>Status: <b data-sync-label></b> <span class="muted" data-sync-user></span></p>
        <div class="toolbar">
          <button type="button" class="btn" data-signin>Sign in with Google</button>
          <button type="button" class="btn" data-syncnow>Sync now</button>
          <button type="button" class="btn quiet" data-signout>Sign out</button>
        </div><p class="bad" data-sync-error></p>`
      : '<p>Sync is off, so everything is saved in this browser only ("Local only"). To sync between devices with your own free Firebase project, follow <code>SETUP-SYNC.md</code> in the repository. Export and import above works without any setup.</p>'}
    </section>

    <section><h2>Keyboard shortcuts</h2>
      <table class="table"><tbody>
        <tr><td><kbd>Ctrl+Enter</kbd></td><td>Run the code</td></tr>
        <tr><td><kbd>Ctrl+Shift+Enter</kbd></td><td>Submit</td></tr>
        <tr><td><kbd>Ctrl+S</kbd></td><td>Save notes now</td></tr>
        <tr><td><kbd>Tab</kbd> / <kbd>Shift+Tab</kbd></td><td>Indent or unindent by 4 spaces</td></tr>
        <tr><td><kbd>Ctrl+/</kbd></td><td>Comment or uncomment the line</td></tr>
      </tbody></table>
      <p class="muted small">On a Mac, use Cmd in place of Ctrl.</p>
    </section>
  </div>`;

  $$('[name="theme"]', main).forEach((r) => { r.onchange = () => putSetting('theme', r.value); });
  $('[data-export]', main).onclick = () => {
    download(`python-practice-backup-${today()}.json`, JSON.stringify(exportAll(), null, 1), 'application/json');
  };
  $('[data-import]', main).onchange = async (e) => {
    const out = $('[data-import-result]', main);
    try {
      const data = JSON.parse(await e.target.files[0].text());
      if (data.app !== 'python-practice' || !data.data) throw new Error('This is not a Python Practice backup file.');
      const taken = mergeIn(data);
      out.className = 'good';
      out.textContent = `Imported. ${taken.exercises} exercise record${taken.exercises === 1 ? '' : 's'} and ${taken.notes} note${taken.notes === 1 ? '' : 's'} were newer in the file and were taken.`;
    } catch (err) {
      out.className = 'bad';
      out.textContent = `Import failed. ${err.message}`;
    }
    e.target.value = '';
  };

  if (!syncEnabled) return null;
  const errorEl = $('[data-sync-error]', main);
  const attempt = (fn) => async () => {
    errorEl.textContent = '';
    try { await fn(); } catch (err) { errorEl.textContent = `That did not work: ${err.message}`; }
  };
  $('[data-signin]', main).onclick = attempt(signIn);
  $('[data-signout]', main).onclick = attempt(signOutUser);
  $('[data-syncnow]', main).onclick = attempt(syncNow);
  return onSyncStatus((label) => {
    const user = syncUser();
    $('[data-sync-label]', main).textContent = label;
    $('[data-sync-user]', main).textContent = user ? `Signed in as ${user.email}` : 'Not signed in';
    $('[data-signin]', main).hidden = !!user;
    $('[data-signout]', main).hidden = !user;
    $('[data-syncnow]', main).hidden = !user;
  });
}
