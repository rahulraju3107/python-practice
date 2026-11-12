# Python Practice

A personal Python learning site. It runs entirely in the browser: lessons, exercises with instant grading, spaced review, timed mode, notes and progress tracking. There is no server, no build step and nothing to install.

Python runs in the browser through [Pyodide](https://pyodide.org), which is included in this repository.

## Publish it on GitHub Pages

You only do this once. It takes about five minutes.

1. Go to <https://github.com/new>. Name the repository `python-practice`, set it to **Public**, and click **Create repository**.
2. Put the files in the repository. Pick one way:
   - **With git** (from inside this folder):
     ```
     git init
     git add .
     git commit -m "Python Practice"
     git branch -M main
     git remote add origin https://github.com/YOUR-USERNAME/python-practice.git
     git push -u origin main
     ```
   - **In the browser:** on the new repository page click **uploading an existing file**, drag in everything from this folder, and click **Commit changes**. GitHub accepts 100 files per upload, so upload the `vendor` folder first, then the rest.
3. In the repository, open **Settings**, then **Pages**.
4. Under **Build and deployment**, set **Source** to **Deploy from a branch**. Choose branch **main** and folder **/ (root)**. Click **Save**.
5. Wait a minute or two, then open `https://YOUR-USERNAME.github.io/python-practice/`.

The first visit downloads Python (about 13 MB). After that the browser keeps it, and the site also works offline.

## Use it on your own computer

Browsers block some features when a page is opened straight from a file, so use a tiny local server. From this folder run:

```
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Where your progress is saved

In your browser, on that device ("Local only" in the corner of the screen). Two ways to move it:

- **Settings > Export** downloads one file. **Import** it on another device. Import merges, keeping the newer copy of each exercise and note.
- Optional automatic sync through your own free Firebase project. See [SETUP-SYNC.md](SETUP-SYNC.md).

Clearing your browser data deletes local progress, so export a backup now and then.

## Adding lessons

Lessons and exercises are plain JSON files in `/content`. The app code never needs to change. [CONTENT-GUIDE.md](CONTENT-GUIDE.md) has the format and the rules.

After adding content, open `validate.html` on your site (for example `https://YOUR-USERNAME.github.io/python-practice/validate.html`) and click **Run all checks**. It runs every reference solution and every test, and lists anything that is wrong.

## What is in here

| Path | What it is |
|---|---|
| `index.html`, `css/`, `js/` | The app: router, editor, runner, grader, storage, pages |
| `worker/` | The web worker that runs Python, and the Python test harness |
| `content/` | `curriculum.json` and one file per module |
| `vendor/` | Pyodide, CodeMirror 5, marked, Firebase. All pre-built. |
| `validate.html` | Content checker |
| `tools/validate.mjs` | The same checker for the command line (`node tools/validate.mjs`). Optional. |
| `sw.js` | Makes the site work offline after the first visit |
| `firebase-config.js` | Empty by default. Sync turns on when it is filled in. |

## Third-party code

Included unchanged in `/vendor`: Pyodide 314.0.7 (MPL-2.0), CodeMirror 5.65 (MIT), marked 18 (MIT), Firebase JS SDK 13.3 (Apache-2.0). CodeMirror is one minified file made from its core, the Python mode and four small add-ons.
