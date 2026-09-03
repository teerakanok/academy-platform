---
name: academy-production-playtest
description: Playtest the live CyberSkills Academy learner journey as a first-time user with a disposable canary identity, bounded desktop/mobile visual evidence, entitlement/progress checks, and explicit production cleanup. Use for Academy production playtests, canary learner walkthroughs, post-release UX/UI checks, or verifying that a real learner can sign in, access a course, learn, submit work, retain progress, re-enter, and sign out.
---

# Academy Production Playtest

Exercise the canonical learner surface at `https://academy.cyberskills.co.th` as a
zero-knowledge learner. This skill does not grant production, Identity Control,
email, entitlement, database, or account-deletion authority.

## Read And Gate

1. Read `AGENTS.md`, `plans/active_plan.md`, `academy-web/docs/privacy/data-processing-register.md`,
   and the director `sensitive-operation` and `deep-visual-review` skills.
2. Confirm the deployed revision and Identity activation are current. Stop if the
   canonical route is disabled, evidence points only to a preview Worker, or the
   candidate is not receiving the intended traffic.
3. Prove the deployed opaque Academy session is consumed by `currentUser()` and the
   protected middleware/pages/APIs used by dashboard, lessons, media, attempts, and
   progress. A successful Identity callback or session-cookie creation alone is not
   an authenticated learner journey. The current source remains blocked when these
   surfaces recognize only the explicitly enabled legacy local fixture.
4. Before mutation, obtain current explicit authority covering the exact Academy
   environment, canary account creation/sign-in, course entitlement, progress and
   attempt writes, and cleanup. Do not infer it from deploy access or an earlier session.
5. Require an audited product-owned operation that issues and revokes the exact
   service activation and course entitlement. Ad hoc production database writes are
   not a canary provisioning path.
6. Record the expected effect, rollback/recovery path, operator, and evidence paths.
   Never expose OTPs, cookies, tokens, email contents, or learner identifiers in logs,
   screenshots, traces, or reports.

## Canary Contract

- Use one controlled mailbox alias owned for testing. Label the identity and display
  data `prod-playtest-academy-<YYYYMMDD>-<run-id>`; derive `run-id` at execution time.
- Use synthetic profile data, no purchase, no marketing consent, no real learner data,
  and the minimum entitlement needed for one non-customer course.
- Record opaque account, entitlement, attempt, and progress references only in the
  protected operator receipt. Ordinary evidence uses the run label and redacted shape.
- Do not reuse a founder, staff, customer, or prior canary identity. Do not share a
  browser profile with an existing signed-in account.
- Academy progress and passing evidence may follow account/learning retention; test
  attempts may have a 90-day policy. Cleanup must therefore revoke temporary
  entitlement, sign out/revoke the session, and use only the approved account-deletion
  or retention path. Never delete database rows directly. Report retained rows and
  their scheduled disposition instead of claiming deletion.

## Zero-Knowledge Walkthrough

Start in a fresh browser context without developer hints. Capture only the browser
surface. Use `1440x900` desktop and `390x844` mobile; add `320px` width for the Thai
learner path when it is in release scope.

1. Open the canonical home/catalog, locate a suitable course, and judge whether price,
   access state, language, syllabus, and next action are understandable unaided.
2. Start sign-in, complete the real Identity Control flow through the controlled
   mailbox, and verify return to the intended Academy route without an open redirect.
3. Verify the dashboard shows exactly the canary entitlement. Check honest empty or
   access-required states before entitlement and the enrolled state after it.
4. Open the course roadmap and first lesson. Exercise reading/video cues, locale
   switching, navigation, back/forward, refresh, keyboard focus, and narrow-screen fit.
5. Launch one practice/checkpoint attempt and, when included, one Crux-backed lab.
   Test one recoverable wrong answer/error before the valid path. Never inspect answer
   keys, internal fixture data, or hidden APIs to help the learner.
6. Complete the minimum meaningful unit. Verify progress/result copy distinguishes
   lesson progress, assessed evidence, and course completion.
7. Close the tab, open a new fresh context, sign in again, and verify the same course,
   resume point, progress, and result. Sign out, then prove a protected route no longer
   exposes the learner session.
8. Check denied access, expired/invalid sign-in state, network retry, double-submit,
   refresh during transition, missing entitlement, and a sanitized server error where
   safely reproducible without damaging production data.

For every state, assess visible hierarchy, copy, feedback, loading stability, touch
targets, focus, contrast, overflow, clipping, and whether the next action is obvious.
Record pass/fail by viewport and route, with browser screenshots only.

## Cleanup And Truth

1. Stop any launched lab through its owning UI and confirm the Crux cleanup receipt;
   do not assume closing the Academy tab stops billable resources.
2. Revoke the canary entitlement and active sessions through authorized product paths.
   Request approved account deletion only when in scope; otherwise record the exact
   retention class and next eligible deletion time. Current-device sign-out does not
   prove other sessions revoked, and absence of a supported account-deletion route is
   a retained-residue condition, not permission for direct database deletion.
3. Re-open protected routes in a fresh context and verify denial. Query only bounded,
   pre-authorized account-scoped projections to confirm residual entitlements,
   sessions, labs, attempts, and progress.
4. A `PASS` requires directly observed canonical production evidence that the opaque
   Identity session authorizes the protected learner surfaces; the audited activation
   and entitlement grant the named course; a progress/attempt write is returned by the
   server and survives re-entry; sign-out denies protected routes; both viewports pass;
   and cleanup/residue is accounted for. Local Playwright, fixtures, HTTP status alone,
   or screenshots without interaction do not prove production acceptance.
5. Return `BLOCKED` when activation, authority, controlled mailbox, safe entitlement,
   cleanup ownership, or billable-lab guard is missing. Separate product defects from
   test-environment blockers and list every retained canary residue.
