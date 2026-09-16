# Academy Platform — session close 2026-09-16

This session did no product work on Academy. It did one thing here, and the
record matters more than the change.

## Branch clearance

`main` is now the only branch, local and remote. It was 22.

Every branch that existed is preserved as `archive/<name>` on the remote — 42
tags — and each tag was **read back from the remote and compared to the branch
sha before anything was deleted**. That order is what makes this recoverable
rather than merely careful: a branch deleted before its tag is confirmed on the
remote is work that exists nowhere.

Restore any of them with:

```sh
git branch <name> archive/<name>
```

This was verified by actually doing it (in crux-lms, on a 9-commit branch) rather
than assumed.

Nothing was evaluated for merit. No branch here was judged obsolete, superseded
or abandoned — the founder asked for the refs to be cleared ahead of a
governance/memory rework, and the tags exist precisely so that judgement can
still be made later, by someone with the context this session did not have.

## State

`bf74fbf`, unchanged. One untracked file, `.githooks/pre-push`, left alone: it
belongs to another session and this session had no business touching it.

## What to read first if you are picking Academy up

`reports/handoffs/20260911T124624256Z-2026-09-11-solid-close.md` is still the
current substantive handoff. Nothing in this session supersedes it.

## Relevant to Academy from elsewhere in this session

Identity Control's `main` was found to be **33 commits behind what production was
serving**, including the terms+consent release and migrations 0022–0030. An
Account Center release had already been built from `main` before it was caught by
hand. Academy authenticates through that same identity stack.

The check that missed it now exists: `deploy/scripts/what-is-live.sh` in crux-lms
discovers each service's checkout and asks "is what is RUNNING contained in
origin/main?". If Academy grows a comparable deploy check, that is the question
worth asking — a deployed commit absent from the branch releases are cut from is
a revert waiting for the next release, and **it never conflicts**.
