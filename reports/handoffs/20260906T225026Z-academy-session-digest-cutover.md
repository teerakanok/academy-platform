# Academy session-ID digest cutover handoff — completed

Read `AGENTS.md`, `plans/active_plan.md`, and the operation record
`reports/operations/20260906-academy-0034-cutover/README.md` first. This
handoff carries evidence only; it grants no production, database, deploy, or
credential authority.

## Current verified state

- Worker deployment `a0a9961e-da7f-48f8-b835-3024704dfbbf` serves
  `1af77a26-bba2-4300-9a71-0bc0262ca06d` at 100%.
- Application source is `0e4417ec4e2909f05ab4eb9f3269bcb1c58c184b`.
- Migration 0034 is committed. Postverify reports marker 1, session count 1,
  transaction count 2, zero invalid digests, zero active claims, zero legacy
  links, five digest RPCs, and `academy_runtime` grants.
- Canonical authenticated `/` and `/sign-in` returned 200; Worker raw host
  returned 404. Authenticated canonical `/robots.txt` returned text/plain 200
  with directives and no Access-login body.

## What happened

Maintenance ran 2026-09-06T22:45:39Z–22:50:26Z. A fresh Academy-only backup
was created, the reviewed ROLLBACK rehearsal passed, then 0034 COMMIT passed.
The direct old candidate forward deploy stopped safely at Cloudflare 10220
because only `IDENTITY_RUNTIME_ENABLED` differed. A new version from the
maintenance latest version enabled that flag and was parity-checked before it
became the 100% serving version. No force/API override was used.

## Boundaries for future work

- Do not deploy old `90c390b5…` after this committed transition and do not
  reapply migrations 0029–0033 or 0034.
- Do not treat the skipped raw-session compatibility check as an active-cookie
  canary: the sole stored session lacked the required 120-second margin.
- No production fresh learner callback, active-cookie persistence, or dashboard
  journey is proven by this cutover. Obtain separately authorized evidence if
  such a claim is needed.
- A real browser Continue action reached Account Center sign-in with expected
  query key names, but no email or challenge was submitted. It started one
  short-lived authorization transaction after the timestamp-specific postverify;
  do not compare later transaction counts to that earlier count of two.
- Database restore is not routine compensation. Use the retained fresh backup
  only through separately authorized, tested Academy-scoped recovery work.

## Evidence

The complete safe receipt bundle, exact wrapper/scripts, and independent R2
review are at `reports/operations/20260906-academy-0034-cutover/`.
