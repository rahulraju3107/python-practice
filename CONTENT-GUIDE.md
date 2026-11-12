# Content guide

How to add lessons and exercises. Follow this file and you never need to touch the app code in `/js`, `/worker` or `/css`.

Contents: [the learner](#the-learner), [files](#files), [lesson format](#lesson-format), [exercise schema](#exercise-schema), [how tests run](#how-tests-run), [writing rules](#writing-rules), [quality gate](#quality-gate), [adding a module step by step](#adding-a-module-step-by-step).

## The learner

- Has coded before (some Java, JavaScript and SQL) but is rusty, and a beginner in Python.
- Learns slowly and forgets without practice. Repetition matters more than speed.
- Wants to be strong at four skills without AI or Google: **file parsing, string manipulation, debugging existing code, and explaining logic in writing**. Give these the most exercises.
- Is preparing for timed coding assessments.
- Uses **Australian English**. Write everything in Australian English (practise as a verb, colour, metres, organise).

Never use a concept before the lesson that teaches it. Lists arrive in Module 4, dictionaries in Module 5, functions in Module 6. Before Module 6, exercises are whole programs that use `input()` and `print()`, not functions.

## Files

```
content/curriculum.json      every module and lesson, in order
content/modules/m01.json     one file per module: its lessons and exercises
```

### curriculum.json

Lists all 14 modules and every lesson title. A module only has a `"file"` once its content exists. Lessons without content show "Coming soon".

```json
{
  "version": 1,
  "modules": [
    {
      "id": "m03",
      "title": "Strings in depth",
      "summary": "One sentence shown on the Learn page.",
      "file": "modules/m03.json",
      "lessons": [
        { "id": "m03-l01", "title": "Indexing and length" }
      ]
    }
  ]
}
```

To publish a module: write `content/modules/mNN.json`, then add `"file": "modules/mNN.json"` to its entry here. The lesson IDs, titles and order in the module file must match `curriculum.json` exactly. You may change the planned lesson titles in `curriculum.json` for modules that have no content yet. Do not change IDs or titles of lessons that already have content.

### Module file

```json
{ "id": "m03", "title": "Strings in depth", "lessons": [ { ...lesson... }, { ...lesson... } ] }
```

### IDs

- Module `m03`, lesson `m03-l02`, exercise `m03-l02-e05`. Always two digits.
- **IDs are permanent.** Progress and notes are stored by ID. Never reuse, renumber or reorder-by-renaming. To remove an exercise, delete it and leave a gap in the numbers. To add one, use the next unused number, wherever it sits in the list.

## Lesson format

Each lesson teaches **one** concept. If a lesson is getting long, split it. Every lesson has the same parts, in this order.

```json
{
  "id": "m03-l02",
  "title": "Slicing",
  "recap": "Two or three lines on the previous lesson. Markdown.",
  "what": "What it is: one or two plain sentences. Markdown.",
  "why": "Why it exists: the problem it solves, with a short before/after example where useful. Markdown.",
  "syntax": "The minimal form in a ```python block, each part labelled with a comment. Markdown.",
  "examples": [
    {
      "title": "Short title",
      "code": "word = \"banana\"\nprint(word[0:3])\n",
      "stdin": "optional: lines typed in, only if the code calls input()\n",
      "output": "ban\n",
      "explain": "Line by line, as Markdown bullets."
    }
  ],
  "mistakes": [
    {
      "title": "What the beginner did",
      "code": "word = \"cat\"\nprint(word[5])\n",
      "stdin": "optional",
      "error": "The full error text exactly as this site shows it. Leave out for logic errors.",
      "fix": "How to read the message and how to fix it. Markdown.",
      "run": false
    }
  ],
  "remember": "A one-line memory hook. Plain text.",
  "quick_checks": [
    { "code": "print(\"abc\"[1])\n", "expected_output": "b\n", "explain": "Why. Markdown." }
  ],
  "reference": [
    { "concept": "Slice", "syntax": "text[start:stop]", "example": "\"banana\"[0:3]   # 'ban'" }
  ],
  "exercises": [ ]
}
```

Rules for each part:

| Part | Rule |
|---|---|
| `recap` | Required, except for the very first lesson of the curriculum. |
| `examples` | Two to four. Each has a Run button and can be edited, so each must be a complete program. `output` must be the real output. If the code calls `input()`, give `stdin`; the output then includes each prompt followed by the typed line, as the Run console shows it. |
| `mistakes` | The errors beginners really make. With `code` and `error`: `error` must be the complete message this site produces (copy it from the Run console or let a script fill it in). With `code` and no `error`: a logic error, and the code must run cleanly. Describe the wrong output in `fix`. Set `"run": false` only for code that never finishes (infinite loops). |
| `quick_checks` | One or two predict-the-output questions. The code must not call `input()`. |
| `reference` | The entries that feed the Quick reference page: the syntax and one tiny example per concept. |
| `exercises` | 8 to 15. Strings, files and debugging lessons should have more. Ordered warm-up, then core, then stretch. |

Python fenced code blocks (```` ```python ````) are syntax-highlighted. Blocks with no language are shown plain: use those for output and error text.

## Exercise schema

Four types. Fields marked * are required for that type.

```json
{
  "id": "m04-l02-e05",
  "type": "write | fix | predict | explain",
  "tier": "warmup | core | stretch",
  "title": "Count the vowels",
  "skills": ["strings", "for-loops"],
  "prompt": "Markdown. What to do, with an example input and output.",
  "starter_code": "def count_vowels(text):\n    pass\n",
  "files": { "orders.csv": "id,item,qty\n1,pen,3\n" },
  "tests": [
    { "name": "simple word", "code": "assert count_vowels('hello') == 2", "hidden": false },
    { "name": "empty string", "code": "assert count_vowels('') == 0", "hidden": true, "edge": true }
  ],
  "stdin_tests": [
    { "name": "basic", "stdin": "3\n4\n", "expected_stdout": "7\n", "hidden": false },
    { "name": "zero", "stdin": "0\n0\n", "expected_stdout": "0\n", "hidden": true, "edge": true }
  ],
  "expected_output": "predict only",
  "hints": ["small nudge", "bigger nudge", "almost the answer"],
  "solution": "reference solution code",
  "solution_explanation": "plain-words explanation, Markdown",
  "model_explanation": "explain only",
  "checklist": ["explain only"]
}
```

| Field | write | fix | predict | explain | Notes |
|---|---|---|---|---|---|
| `id`, `type`, `tier`, `title`, `skills`, `prompt` | * | * | * | * | |
| `starter_code` | * | * | * | * | write: the starting point (may be `""`). fix: the broken code. predict and explain: the code to read (shown read-only). |
| `tests` and/or `stdin_tests` | * | * | | | At least one visible test and at least one with `"edge": true`. |
| `hints` | * | * | optional | | One to three, each a bigger nudge than the last. |
| `solution` | * | * | | | Must pass every test. |
| `solution_explanation` | * | * | * | | For predict: why the output is what it is. |
| `expected_output` | | | * | | Must equal the real output exactly. |
| `model_explanation`, `checklist` | | | | * | Checklist of at least two things a good answer mentions, including an edge case where there is one. |
| `files` | optional | optional | optional | optional | Written to the working folder before every run, so `open("orders.csv")` works. |

Changes from the original draft schema: tests gained `"edge": true` (so the checker can confirm an edge case exists), assert tests may carry their own `"stdin"`, and `starter_code` doubles as the code to read for predict and explain exercises.

### Types

- **write**: write a program or function from a description. Graded by tests.
- **fix**: broken code plus a failing test or traceback in the prompt. The starter code must fail at least one test. Mix syntax errors, logic errors, off-by-one errors, wrong types and, from Module 6 on, bugs in larger multi-function programs. Say in the prompt how many bugs there are when there is more than one. If the prompt shows a traceback, it must be the real one.
- **predict**: read code and type the exact output. Run stays disabled until the answer is checked. Two tries, then the answer is shown and the exercise is marked "Solved with help". The code must not call `input()` and must not raise an error.
- **explain**: read code and explain it in writing. The learner then sees `model_explanation`, ticks `checklist` items, and marks "Got it" or "Missed things". The code must run without an error. If it calls `input()`, add a top-level `"stdin"` field for the checker (better: avoid `input()` here).

### Tiers

`warmup` (one idea, almost a copy of an example), `core` (the lesson's idea in a realistic task), `stretch` (combines ideas, several bugs, or a trap such as an empty input). Every lesson needs all three, in that order.

### Skills

Free-text tags, lowercase with hyphens. They drive the per-skill table, weak areas and the timed-mode filter, so reuse existing tags.

- The four priority skills: `file-parsing`, `strings`, `debugging`, `explaining`.
- **Every fix exercise must include `debugging`. Every explain exercise must include `explaining`.** Predict exercises include `tracing`.
- In use so far: `variables`, `printing`, `input`, `types`, `conversion`, `operators`, `f-strings`, `strings`, `conditionals`, `boolean-logic`, `while-loops`, `for-loops`, `range`, `break-continue`, `nested-loops`, `indexing`, `slicing`, `string-methods`, `split-join`, `formatting`, `validation`, `parsing`, `tracing`, `debugging`, `explaining`, `lists`, `list-methods`, `searching`, `sorting`, `tuples`, `unpacking`, `nested-lists`, `mutation`.
- Every Module 3 exercise carries `strings` plus one or two of the narrower tags, so the Strings row in the skill table covers the whole module.
- Every Module 4 exercise carries `lists` plus one or two of the narrower tags (`indexing`, `slicing`, `list-methods`, `searching`, `sorting`, `tuples`, `unpacking`, `nested-lists`, `mutation`).
- Suggested for later modules: `dictionaries`, `sets`, `functions`, `errors`, `file-parsing`, `csv`, `json`, `comprehensions`, `classes`, `regex`, `datetime`, `complexity`, `recursion`, `two-pointers`, `sliding-window`, `stacks-queues`, `binary-search`, `trees`, `graphs`, `heaps`, `dynamic-programming`.

## How tests run

All grading is done by plain Python in the browser (`worker/harness.py`). There is no AI grading.

Every test starts from a clean state: a fresh set of variables, a fresh working folder with `files` written into it, and fresh input.

### `tests` (assert style)

1. The learner's whole program runs first, with the test's optional `"stdin"` as input.
2. Then the test `code` runs in the same namespace. So tests can call the learner's functions **and** read their top-level variables.

```json
{ "name": "total is right", "code": "assert total == 49" }
{ "name": "handles empty list", "code": "assert average([]) == 0", "hidden": true, "edge": true }
{ "name": "reads the price", "stdin": "4.5\n", "code": "assert price == 4.5" }
```

- Write the final check as `assert <expression> == <expected>` (or `!=`, `<`, `<=`, `>`, `>=`, `in`, `not in`, `is`). On a failure the learner is shown the expression, the expected value and what they got. Any other form of assert only shows "expected True".
- Lines before the assert are set-up and may be any Python: `data = [3, 1, 2]`.
- An assert message is shown to the learner as a note: `assert total == 49, "add all three purchases"`.
- Two helpers are available inside test code:
  - `_stdout`: everything the program printed, with trailing spaces and trailing blank lines removed. `assert _stdout == "12\n19\n49"`.
  - `printed(func, *args)`: calls a function and returns what it printed, cleaned the same way. `assert printed(show_total, 3) == "Total: 3"`.

### `stdin_tests` (whole-program style)

The program runs with `stdin` as its input, and everything it prints is compared with `expected_stdout`.

- Trailing spaces on each line and blank lines at the end are ignored. Everything else must match exactly, including capitals, punctuation and spaces at the start of a line.
- **Prompt text is not counted.** In tests, `input("Name: ")` prints nothing. Only `print()` output is compared. So starter code and solutions can use prompts freely.
- One line of `stdin` per `input()` call, each ending in `\n`. An empty line is `"\n"`. No input at all is `""`.
- If the program calls `input()` more times than there are lines, it gets an `EOFError`. This is useful: a test whose input stops early proves the program stopped reading when it should.

### Hidden tests

`"hidden": true` hides a test from the Task tab. It still runs on Submit, and after a submission the learner sees its input, expected and actual result. Use hidden tests so the learner has to think about edge cases, not to keep secrets.

### Other behaviour to know

- Run shows prompts and echoes each typed line after its prompt, like a terminal. That is why example `output` for programs with `input()` contains those lines.
- A run that takes more than 5 seconds is stopped with "Your code took too long. Check for an infinite loop."
- Output is capped at 200,000 characters.
- Tracebacks only show the learner's own lines (`main.py`), and the line number is highlighted in the editor.
- The standard library is available. Third-party packages are not loaded.

## Writing rules

- Simple words and short sentences. Define every technical term the first time it appears, in bold.
- Explain **why**, not just what.
- Realistic examples: receipts, log lines, CSV rows, usernames, temperatures, opening hours. Never `foo` and `bar`.
- Keep each lesson short. Split it rather than writing one long page.
- Show the error message the learner will really see, and teach how to read it (last line first).
- No filler exercises. Do not repeat one task with different variable names. Each exercise must practise a slightly different case: a different boundary, a different bug type, a different output format, a different way the input can be awkward.
- Prompts say exactly what to print. Show one example of input and output. State the boundaries ("50 or more", "up to but not including 17").
- Choose test numbers that avoid floating-point surprises (`0.1 + 0.2`) and rounding ties (`2.675`, `17.25`). Use values like `2.5`, `4.25`, `13.5`.
- Hints never give the full answer before the last hint.
- `solution_explanation` names the idea that makes the solution work, and for fix exercises names each bug.
- Australian English. No emoji.

## Quality gate

AI-written tests can be wrong, and a wrong test makes the learner doubt a correct answer. Nothing ships until the checker passes with zero failures.

Run it either way:

- Open `validate.html` on the site and click **Run all checks**.
- Or from the repository folder: `node tools/validate.mjs` (Node 18 or newer, nothing to install).

It checks, for every lesson and exercise:

1. Every write and fix exercise has a reference solution that passes **all** of its tests.
2. Every fix exercise's starter code fails at least one test. Every write exercise's starter code does not already pass.
3. Every predict exercise's `expected_output` equals the real output, and the code runs without an error.
4. Every write and fix exercise has at least one visible test and at least one test marked `"edge": true` (empty input, a single item, a boundary value, zero, unusual spacing and so on).
5. Every worked example's `output`, every quick check's `expected_output` and every mistake's `error` match what the code really does.
6. Structure: required fields present, IDs unique and correctly formed, types and tiers valid, exercises ordered warm-up to stretch with all three tiers present, at least 8 exercises per lesson, two to four examples, one or two quick checks, fix exercises tagged `debugging`, explain exercises tagged `explaining`, and the module file matching `curriculum.json`.

The checker cannot judge wording or difficulty. Before finishing, also read each fix prompt against what the broken code really does ("it prints 34" must be true), and make sure no exercise uses a concept from a later lesson.

## Adding a module step by step

1. Read the lesson list for the module in `content/curriculum.json`, and skim the previous module file to match its tone and depth.
2. Write `content/modules/mNN.json` with one lesson object per lesson, in the same order and with the same IDs and titles as `curriculum.json`. Each lesson's `recap` covers the lesson before it.
3. Add `"file": "modules/mNN.json"` to the module's entry in `curriculum.json`.
4. Run the quality gate. Fix every failure. Run it again until it reports zero.
5. Open a few lessons and exercises in the browser and try them as the learner would.

Tip: writing JSON with escaped newlines by hand is error-prone. It is fine to write the content in a small script (Python dictionaries with triple-quoted strings, for example) that prints the JSON, as long as the JSON file in `/content` is what gets committed and nothing needs to be built by the learner.

### Size targets

At least 450 exercises across all 14 modules. Strings (Module 3), debugging (Module 7) and files (Module 8) together should hold about a third of them. Modules 1 and 2 have 130, Module 3 has 96 and Module 4 has 76.

The quality gate needs at least 8 exercises in every lesson, so the smallest a module can be is 8 times its number of lessons. That makes Module 7 at least 80 and Module 8 at least 104, and the whole curriculum at least 872. Plan each module from its lesson count, not from a round number. Fix and explain exercises belong in every lesson, not only in Module 7.

Until Module 4, `split()` results are only used with indexing, `len()`, a `for` loop and `join`. No other list features.
