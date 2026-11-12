// Settings: theme, backup (export and import), sync, shortcuts.
import { $, $$, esc, download, today } from '../util.js';
import { getSetting, putSetting, exportAll, mergeIn } from '../storage.js';
import { syncEnabled, onSyncStatus, syncUser, syncMessage, signInGoogle, signInEmail, signUpEmail, resetPassword, signOutUser, syncNow } from '../sync.js';

export function settingsPage(main) {
  const theme = getSetting('theme', 'system');
  main.innerHTML = `<div class="page">
    <h1>Settings</h1>

    <section><h2>Account and sync</h2>
      ${syncEnabled ? `<div data-signed-out>
          <p>Sign in to keep your progress and notes in step across your devices. Everything is still saved in this browser first.</p>
          <form class="auth-form" data-auth>
            <label class="field"><span>Email</span><input type="email" name="email" autocomplete="email" required></label>
            <label class="field"><span>Password</span><input type="password" name="password" autocomplete="current-password"></label>
            <div class="toolbar">
              <button type="submit" class="btn primary">Sign in</button>
              <button type="button" class="btn" data-signup>Create account</button>
              <button type="button" class="btn quiet" data-reset>Forgot password</button>
            </div>
          </form>
          <div class="toolbar"><span class="muted small">or</span><button type="button" class="btn" data-google>Sign in with Google</button></div>
        </div>
        <div data-signed-in hidden>
          <p>Signed in as <b data-email></b>. Status: <b data-sync-label></b></p>
          <div class="toolbar">
            <button type="button" class="btn" data-syncnow>Sync now</button>
            <button type="button" class="btn quiet" data-signout>Sign out</button>
          </div>
          <p class="muted small">Signing out keeps everything that is saved in this browser.</p>
        </div>
        <p data-sync-msg aria-live="polite"></p>`
      : '<p><b>Accounts are not set up yet.</b> Until then, everything is saved in this browser only ("Local only"). The setup is a short checklist in <code>SETUP-SYNC.md</code>. Export and import below work without it.</p>'}
    </section>

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
  const msg = $('[data-sync-msg]', main);
  const form = $('[data-auth]', main);
  const say = (text, cls = 'muted') => { msg.className = cls; msg.textContent = text; };
  const attempt = (fn, working, done = '') => async () => {
    say(working);
    try { await fn(); say(done); } catch (err) { say(err.message, 'bad'); }
  };
  const email = () => form.email.value;
  const password = () => form.password.value;
  form.addEventListener('submit', (e) => { e.preventDefault(); attempt(() => signInEmail(email(), password()), 'Signing in.')(); });
  $('[data-signup]', main).onclick = attempt(() => signUpEmail(email(), password()), 'Creating your account.');
  $('[data-reset]', main).onclick = attempt(() => resetPassword(email()), 'Sending.', 'If there is an account for that address, a password reset email is on its way. Check your junk folder too.');
  $('[data-google]', main).onclick = attempt(signInGoogle, 'Opening Google sign-in. If no window appears, this page will go to Google and come back.');
  $('[data-signout]', main).onclick = attempt(signOutUser, 'Signing out.', 'Signed out. Your progress is still saved in this browser.');
  $('[data-syncnow]', main).onclick = attempt(syncNow, 'Syncing.');
  return onSyncStatus((label) => {
    const user = syncUser();
    $('[data-signed-out]', main).hidden = !!user;
    $('[data-signed-in]', main).hidden = !user;
    $('[data-sync-label]', main).textContent = label;
    $('[data-email]', main).textContent = user ? (user.email || 'your account') : '';
    if (syncMessage()) say(syncMessage(), syncMessage().startsWith('First sync') || syncMessage().startsWith('Backup') ? 'good' : 'bad');
  });
}
