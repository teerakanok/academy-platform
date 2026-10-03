# AL-17 Step 2 brief: Thai plain-language pass (founder-approved)

Repo worktree: /Users/teerakanok/Dev/continuations/academy-first-launch-claude-1
Content dir: academy-web/content/courses/<course>/locales/th/
Approved sample + style guide (READ FIRST, fully): reports/content/2026-10-thai-plain-language-sample.md
Founder decision 2026-10-03: "โอเค เกลาแบบนี้ทั้งสองคอร์ส" — approve sample + style guide; leave code comments and try.steps (including Thai parentheticals) untouched.

## Goal
Rewrite the Thai prose so it reads like natural Thai written by a Thai engineer, not translated English, following the 8-rule style guide in the sample file. Match the tone and degree of change in the sample's "หลัง" column. Light touch where text is already natural — do not rewrite for its own sake.

## Editable (Thai prose only)
title, objective, blocks[].text, blocks[].title, blocks[].caption, blocks[].items[], blocks[].headers[], blocks[].rows[][] (Thai description cells only — never the command cells), blocks[].alt, blocks[].expected, cheatsheet[] (Thai part only); in course.json: title/subtitle/audience/outcomes/skillLabels/nodeTitles/description-type prose.

## Never change
- meaning, facts, numbers, examples
- any command, flag, path, filename, code, URL, inline command inside prose (keep each ASCII token exactly; you may add English technical terms per rule 1)
- blocks[].lines (code blocks incl. comments), blocks[].steps (try steps incl. Thai parentheticals), kind, tone, ordered, src
- checkpoint[] and videoCueQuestions[] entirely (prompts, choices, explanations, answers)
- nodeId, locale, JSON structure, list lengths, key order; any EN file
- course.json: do not add references to other courses; git-essentials audience was just rewritten by card AL-16 to remove hidden-course references — keep that meaning (refer to "คอร์สพื้นฐานระบบปฏิบัติการและ Linux" only as it already does)

## Sample lessons
For files-and-safety, navigate-and-look, users-and-root, why-version-control, init-and-commit, merging and git-essentials course.json audience: apply the sample's "หลัง" text verbatim for every row in the sample table (the "ก่อน" text equals the current file text; if a row's "ก่อน" no longer matches because of a later fix, adapt carefully and report it). Parts the sample left untouched stay untouched.

## How to edit
Edit the JSON in place with a small Python script per file (json.load / json.dump with ensure_ascii=False, indent=2, and a trailing newline) or with exact Edit replacements. Keep the file formatting identical to the original (2-space indent, UTF-8, Thai not escaped) so the git diff shows only changed strings. Check with `git diff --stat` that only your files changed.

## Gate (must pass before you finish)
From academy-web/:  python3 ../artifacts/AL-17/check-th-edit.py 20bf386 <your files>
- Any FAIL = fix it.
- Each WARN (ASCII token dropped) = either restore the token, or confirm it was a pure English filler word legitimately removed and list it in your report.

## Do not
commit, stage, run git stash/checkout/reset, touch files outside your list, or edit EN text.

## Report back (concise)
Files edited; number of strings changed per file; checker output summary; every remaining WARN with justification; anything you were unsure about (meaning ambiguity) — leave such strings unchanged and list them.

## Formatting exception
permissions.json, pipes-and-logs.json and ssh-and-remote.json keep checkpoint entries on single compact lines, so json.dump would reformat them. For these three files edit with exact string replacements on the raw text (Edit tool, or Python str.replace on the file text with an assert that each old string occurs exactly once) — never re-serialize them.
