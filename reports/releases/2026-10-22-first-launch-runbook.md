# CyberSkills Academy — first public launch runbook (2026-10-22)

**Status:** draft for the mandatory second-provider omission review and founder launch approval.

**Author scope:** read-only repository inspection; **no live system, DNS, Cloudflare, Worker, database, account, or course mutation was performed for this document.**

**Launch timezone:** Asia/Bangkok. Target launch date is **2026-10-22**; all launch prerequisites must be complete by **2026-10-20, 17:00 +07**.

This runbook implements the amended launch shape, not a menu of alternatives:

- Public launch on `https://academy.cyberskills.co.th`.
- Publish exactly two founder-chosen courses:
  - `basic-os-linux`
  - `git-essentials`
- Keep six existing free courses unpublished:
  - `assembly`
  - `c-low-level`
  - `computer-architecture`
  - `computer-networking`
  - `operating-systems`
  - `setup-and-environment`
- Launch with the current learner-facing privacy/retention/appeal wording; review after launch.
- Keep `/admin`, `/api/admin`, and `/player` internal.

Founder references recorded by the gathering host for AL-10 rev3:

- Public launch with only 1–2 courses: `inbox-2026-10-03T09-46-15-305Z-g393`.
- Current legal text and post-launch review: `inbox-2026-10-03T09-47-32-970Z-kbqp`.
- Launch courses Linux fundamentals + Git: `inbox-2026-10-03T09-58-53-203Z-3z2x`.

## 1. Owners and decision authority

| Responsibility | Owner | Required action |
| --- | --- | --- |
| Final go/no-go, rollback decision, second-account canary | Founder / product owner | Give the current launch go-grant after every blocking item below is PASS; personally run or directly supervise the canary. |
| Cloudflare Zero Trust snapshot, exposure change, and Access rollback | Director-root / authorized live-ops host | Use the exact Access application/policy state in this runbook; preserve a pre-change export and readback. |
| Worker release and version rollback | Authorized live-ops host | Use the pinned production release path in [`docs/maintenance/academy-production-release.md`](../../docs/maintenance/academy-production-release.md), not `npm run deploy:cf`. |
| Course visibility changes and visibility rollback | Founder using the Academy owner account | Make changes only through `/admin/courses` / its owner-audited API after the security batch is live. |
| Database and retention evidence | Authorized Academy production operator | Read only through approved operational paths; do not manually invoke production purge RPCs. |
| Private-media production proof | Founder + authorized live-ops observer | Use only the controlled canary account and sanitized browser evidence. |
| Runbook omission review | Independent second provider | Review against the amended AL-08/AL-10 scope and record findings before founder GO. |

A deploy, exposure, visibility, rollback, or canary action is not authorized by this document alone. The launch go-grant must name:

1. the exact serving Worker source/version after AL-09;
2. the eight `course_settings` operations in §4;
3. the three internal Access applications in §5;
4. the controlled second-account canary and cleanup;
5. this rollback plan.

## 2. Baseline that rollback must restore

### 2.1 Canonical exposure and Cloudflare Access

The launch baseline is the canonical host protected by Cloudflare Access, not an already-public site:

- Last directly observed public probes on 2026-08-23 returned Cloudflare Access `302` for `/`, `/courses`, and `/auth/callback`: [`academy-canonical-domain-deployment-receipt-20260823.json`](../reviews/academy-canonical-domain-deployment-receipt-20260823.json).
- Current inventory still describes the canonical domain as Access-gated: [`docs/maintenance/academy-system-inventory.md`](../../docs/maintenance/academy-system-inventory.md).
- Last recorded, not independently re-queried by that receipt, non-secret control-plane identifiers are:
   - Access application: `72f37caa-6573-4898-8bd1-b4aaaba741cc`
   - Access policy: `d5aa4dcf-f77c-4b63-b14f-5c2dc909fff2`
   - Workers domain: `66178dd8e6851ce25fe893959be4c1b630afd3dd`
   - Workers domain target: `cyberskills-academy`
- The raw `cyberskills-academy.songpon-te.workers.dev` route remains deliberately gated and must continue to return `404`; do not add it to `ACADEMY_SERVED_HOSTS`. Source contract: [`academy-web/src/lib/edge-host-policy.ts`](../../academy-web/src/lib/edge-host-policy.ts).

**Mandatory pre-change snapshot (blocking):**

1. Export the complete current Access application and every policy linked to `academy.cyberskills.co.th`, including path, decision, include/require rules, session configuration, and ordering. The Cloudflare API shape is `/accounts/{account_id}/access/apps/{application_id}` plus its nested policies; a dashboard export with the same fields is acceptable.
2. Export the definitions of any other Access application that can match this host.
3. Store the exports in protected operations evidence, not this Git repository, because they may contain account emails or directory identifiers. Record only the storage location, SHA-256, and a sanitized field summary in the launch receipt.
4. Probe and record exact unauthenticated status/Location for `/`, `/courses`, `/auth/callback`, `/admin`, and `/player`.
5. Stop if live readback differs from the Access-gated baseline. Update this runbook and obtain a new owner approval before proceeding.

### 2.2 Course catalog, entitlements, and settings

Production state at 2026-09-17 ([source](../state/2026-09-17-production-state.md)) records:

- Eight free courses in `academy.course_offer`, all effectively published at that time.
- The founder account holds grants for all eight published courses.
- `INTERNAL_SURFACES=on`.

The launch must not delete or change `course_offer` rows or existing entitlements. Visibility is the launch control.

Before launch, the owner must capture and protect a complete readback of all eight `course_settings` rows and effective values:

```text
course_slug, title_override, subtitle_override, visibility, settings,
edited_by, edited_at, effective visibility
```

`edited_by` is an account UUID; keep the full row export in protected operations evidence. A sanitized launch receipt may show only slug, null/non-null override flags, visibility, and timestamp.

The expected pre-launch baseline is eight effective `published` courses. It must be proved by readback; do not infer it from the September state record.

### 2.3 Worker version

The last production state in this baseline branch records Worker `3ae76859-3056-405e-bbb9-b4d5b16709ee` at 100% from source `68083b8` ([source](../state/2026-09-17-production-state.md)). AL-09 will supersede that version with the security batch before launch.

At the launch checkpoint, record all of the following **after AL-09**:

| Field | Required value |
| --- | --- |
| Worker name | `cyberskills-academy` |
| Serving version ID | Readback required; do not assume the September value. |
| Deployment ID / allocation | Readback required; must be 100% to the intended version. |
| Source commit and release tag | Readback required and must match the integrated AL-01..AL-05 release. |
| Rollback version ID | The immediately preceding verified version, compatible with retained schema changes. |
| Raw workers.dev result | `404` host-gate remains expected. |

Use the exact version-upload, candidate-attributed smoke, and allocation procedure in [`docs/maintenance/academy-production-release.md`](../../docs/maintenance/academy-production-release.md). A build output or upload receipt alone is not serving evidence.

## 3. Pre-launch gate checklist

Every row is either linked to current evidence or explicitly OPEN. No OPEN row in the **Result** column may be converted to PASS without new evidence and the AL-09/AL-10 review.

| # | Blocking gate | Evidence / current state | Result | Owner |
| ---: | --- | --- | --- | --- |
| 1 | Second-provider omission review of this runbook | This document; review not yet run. | **OPEN** | Independent second provider |
| 2 | AL-01 dependency upgrade integrated | Next `15.5.27`, sharp `0.35.5`; source tests/build PASS in [`reports/verification/2026-10-03-AL-01-next-sharp-upgrade.md`](../verification/2026-10-03-AL-01-next-sharp-upgrade.md). | Source PASS; production deploy **OPEN** | Live-ops host |
| 3 | AL-02 admin internal gate integrated and reviewed | Security finding: [`academy-web/reports/security-review-2026-09-19.md`](../../academy-web/reports/security-review-2026-09-19.md); source candidate exists but is not the launch baseline yet. | **OPEN** until AL-09 | Live-ops host + reviewer |
| 4 | AL-03 visibility enforcement integrated, reviewed, and deployed | Current gap: [`academy-web/reports/security-review-2026-09-19.md`](../../academy-web/reports/security-review-2026-09-19.md). The source candidate and migration exist in the gathering but are not yet the launch baseline, and its changed-file set does not cover the direct public overview routes. AL-10 requires `/courses/<slug>` and `/courses/<slug>/<locale>` to return `404`, so AL-03 must be extended/reviewed for those routes in addition to its existing sitemap/lesson/start/RPC scope; host issue `fdf9cee53255463088170419366b36aa` records this decision. Actual PostgreSQL proof must follow the AL-03 receipt contract. | **OPEN** (source/native/deploy states must be recorded separately) | Live-ops host + reviewer |
| 5 | AL-04 rate limiting integrated and reviewed | Public/session read rate-limit finding in [`academy-web/reports/security-review-2026-09-19.md`](../../academy-web/reports/security-review-2026-09-19.md). | **OPEN** until AL-09 | Live-ops host + reviewer |
| 6 | AL-05 shared `service_role` reduction integrated and reviewed | Core learner-table blast-radius finding in [`academy-web/reports/security-review-2026-09-19.md`](../../academy-web/reports/security-review-2026-09-19.md). | **OPEN** until AL-09 | Live-ops host + reviewer |
| 7 | AL-09 production migration rehearsal, backup, Worker deploy, and smoke | Required scope: AL-01..AL-05 only, with prior version/backup retained: [`docs/maintenance/academy-production-release.md`](../../docs/maintenance/academy-production-release.md). | **OPEN** | Live-ops host |
| 8 | Unit/type/build gates on the exact integrated release | AL-01 evidence is source PASS but predates the full integration. Re-run on the AL-09 release commit. | **OPEN** | Live-ops host |
| 9 | Launch Worker allocation readback | §2.3 table must be completed from live control-plane evidence. | **OPEN** | Live-ops host |
| 10 | Access application/policy export and baseline probes | §2.1 mandatory snapshot. | **OPEN** | Director-root / live-ops host |
| 11 | Course visibility baseline export | §2.2 mandatory eight-row readback. | **OPEN** | Founder / production operator |
| 12 | Retention cron event evidence | Worker and six-job contract: [`academy-web/docs/academy-retention-scheduler.md`](../../academy-web/docs/academy-retention-scheduler.md). Rollout deployed the worker, but first-event proof remains pending: [`reports/academy-retention-api-rollout-2026-08-06.md`](../academy-retention-api-rollout-2026-08-06.md). | **OPEN** | Production operator |
| 13 | Private media production proof for `basic-os-linux` | Remote R2 preview passed, production authenticated proof remains a gate: [`academy-web/docs/private-media-delivery.md`](../../academy-web/docs/private-media-delivery.md) and [`reports/reviews/private-media-remote-activation-2026-08-04.md`](../reviews/private-media-remote-activation-2026-08-04.md). | **OPEN** | Founder + live-ops observer |
| 14 | Legal decision recorded | Founder chose current wording with post-launch review (`inbox-2026-10-03T09-47-32-970Z-kbqp`); post-launch pack/review due 2026-11-05 17:00 +07. Current privacy surface starts at [`academy-web/src/app/(site)/privacy/page.tsx`](../../academy-web/src/app/%28site%29/privacy/page.tsx). | Founder decision PASS; independent legal review **OPEN after launch** | Founder; AL-11 owner |
| 15 | Hidden-course link/prerequisite audit | AL-12 scope is exactly the two launch courses and six hidden courses. | **OPEN** | AL-12 owner |
| 16 | Founder second-account free-enrol journey | Explicitly remaining in [`reports/handoffs/20260917T081046000Z-2026-09-17-session-close.md`](../handoffs/20260917T081046000Z-2026-09-17-session-close.md); must use the canary contract in [`skills/academy-production-playtest/SKILL.md`](../../skills/academy-production-playtest/SKILL.md). | **OPEN** | Founder |
| 17 | Fresh founder GO | Required after all blocking rows and review findings close. | **OPEN** | Founder |

### 3.1 Retention acceptance detail

The retention worker runs daily at `03:00 UTC` (`10:00 +07`). Before GO, inspect Cloudflare Worker Trigger Events/logs for the most recent scheduled execution and prove one terminal event for every currently configured job:

```text
attempts
waitlist
accounts
privacy-requests
staff-authorization
course-entitlement-history
```

Acceptance is six `retention.purge_complete` events, or explicitly surfaced `retention.purge_failed` events with an owner-approved incident decision. The current six-job source list is [`academy-web/ops/academy-retention-worker/retention.ts`](../../academy-web/ops/academy-retention-worker/retention.ts). An August rollout report that mentions five wrappers is historical deployment evidence, not current completeness proof.

Do not invoke the production PostgREST purge RPC by hand merely to create evidence. If a job failed, follow the incident path in the scheduler document and treat retention as a launch blocker unless the founder accepts the exact failure and bounded recovery plan in writing.

### 3.2 Private-media acceptance detail

`basic-os-linux` has four registered private assets in [`academy-web/src/lib/media/registry.ts`](../../academy-web/src/lib/media/registry.ts):

- `os-video-en`
- `os-video-th`
- `os-captions-en`
- `os-captions-th`

`git-essentials` has no registered private-media asset; do not claim a media proof for Git.

Using the authorized canary account in the `os-what-it-does` lesson, prove on the production canonical host:

1. the rendered browser request uses clean `/course-media/<asset-id>` paths, never a signed query token;
2. video playback works in English and Thai, including a byte-range request (`206`);
3. English and Thai captions load;
4. legacy public URLs `/media/lesson-demo.mp4` and `/media/lesson-demo-th.mp4` do not return the media;
5. a tampered cookie is rejected without R2 delivery;
6. an expired grant re-authorizes only while course/session/prerequisite access remains valid;
7. media responses are private/no-store and no object key appears in the browser URL or sanitized evidence.

The five-object remote R2 activation report proves object integrity and preview behavior, not this production journey. Keep this gate OPEN until the canary evidence exists.

## 4. Exact course visibility change

**Precondition:** AL-03 is deployed and independently reviewed, AL-09 is complete (including reviewed migration `0043_launch_course_visibility_rpc.sql`), and the §2.2 baseline export exists. If AL-03 or the audited launch RPC is absent, do not change Access: the six hidden courses could remain reachable, or the runner would have no safe non-session visibility path.

The AL-03 scope named in the gathering covers sitemap, `authorizeCourseResource`, the free-start page, and the enrol RPC. The public overview files still call `getPublicCourse()` without `course_settings` in the inspected source candidate. Therefore this runbook treats direct overview enforcement as an explicit additional AL-03/AL-09 launch requirement; AL-10's page-404 acceptance cannot be waived.

Do not write `course_settings` directly with SQL and do not reuse a human owner browser session in the one-click runner. Migration `0043` adds the narrowly scoped `academy.set_launch_course_visibility` / `academy.inspect_launch_course_visibility` RPCs. A member of `academy_staff_admin` may execute only those functions; it receives no `course_settings` table rights. Inside one transaction the RPC requires the protected pre-launch state hash, derives the sole active owner, applies only the founder-approved eight-course shape, and appends `before_state`, `after_state`, owner account, founder approval reference, row count, and time to `course_settings_launch_audit`. Rollback accepts only the exact audited pre-launch state and records the reverse transition. The trade-off is a new reviewed schema migration and a scoped launch database credential; this is preferred over direct SQL or a borrowed owner session because attribution and exact-state recovery remain durable.

### 4.1 Launch target

| Course | First lesson node | Required `course_settings.visibility` | Launch result |
| --- | --- | --- | --- |
| `basic-os-linux` | `os-what-it-does` | `published` | Public overview; entitled learner path and four private media assets available. |
| `git-essentials` | `why-version-control` | `published` | Public overview; entitled learner path available; no private-media asset. |
| `assembly` | `why-read-assembly` | `unpublished` | Hidden from catalog, sitemap, overview, lesson, start, and enrol. |
| `c-low-level` | `why-c` | `unpublished` | Hidden from all listed surfaces. |
| `computer-architecture` | `what-is-an-isa` | `unpublished` | Hidden from all listed surfaces. |
| `computer-networking` | `how-machines-talk` | `unpublished` | Hidden from all listed surfaces. |
| `operating-systems` | `kernel-vs-user-mode` | `unpublished` | Hidden from all listed surfaces. |
| `setup-and-environment` | `choose-your-environment` | `unpublished` | Hidden from all listed surfaces. |

Use `unpublished`, not `retired`, for the six launch-hidden courses. `retired` is a stronger soft-delete and is not needed to shape the first launch.

After the RPC commits, its read-only inspection must require:

- `basic-os-linux` and `git-essentials`: effective visibility `published`, overridden `true`;
- all six other courses: effective visibility `unpublished`, overridden `true`;
- no row changed `title_override`, `subtitle_override`, or `settings`;
- `course_offer` remains eight free offers and founder entitlements are unchanged.

While Access still protects the canonical host, use an authorized owner browser to verify:

- `/courses` contains exactly the two launch courses;
- `/sitemap.xml` contains only the two launch course locale pairs;
- direct public overview, localized overview, first lesson, `/start`, and enrol path for each hidden course is refused;
- the founder account, which already has entitlement to all eight courses, cannot open a hidden course lesson. This specifically proves AL-03's entitlement-does-not-bypass-visibility rule.

Only after those checks pass may the operator change Access.

## 5. Exact Cloudflare Zero Trust / route change

### 5.1 Required topology

Do **not** change DNS, the Workers custom domain, the CNAME, the raw workers.dev gate, or Worker code to make the site public. Only Access matching changes.

Launch topology:

| Access application | Host | Path | Policy / include rules | Expected unauthenticated result |
| --- | --- | --- | --- | --- |
| Existing app `72f37caa-6573-4898-8bd1-b4aaaba741cc`, renamed for clarity | `academy.cyberskills.co.th` | `/admin` | Retain the exported launch-baseline allow policy/decision; no Everyone and no Bypass. | `302` to Cloudflare Access for `/admin` and `/admin/courses`. |
| New `Academy internal admin API` | `academy.cyberskills.co.th` | `/api/admin` | Clone the exported launch-baseline allow policy/decision; no Everyone and no Bypass. | `302` to Cloudflare Access for `/api/admin/courses`. |
| New `Academy internal player` | `academy.cyberskills.co.th` | `/player` | Clone the exported launch-baseline allow policy/decision; no Everyone and no Bypass. | `302` to Cloudflare Access for `/player` and subpaths. |
| No Access application | `academy.cyberskills.co.th` | public host except the three internal families | No Access policy. | The Academy Worker/middleware answers. |

Rules:

1. The current whole-host application must no longer match `/`, `/courses`, `/auth/callback`, `/sign-in`, or other learner routes.
2. `/auth/callback` must be outside Access. A Cloudflare Access redirect on the callback would break public Account Center sign-in.
3. Copy session duration and other non-secret application configuration from the exported baseline. Do not invent a broader Identity directory rule.
4. Policy include rules must exactly match the pre-launch Access allow membership. Product-level `/admin` owner checks and `/player` staff checks remain mandatory; Access is an additional boundary, not authorization replacement.
5. Confirm Cloudflare's route evaluator shows `/admin/courses`, `/api/admin/courses`, `/player`, `/player/module/cas005-module-1`, and `/player/exam/cas005-full-practice-02` protected by the intended application. Path protection must not be inferred only from creating the app.
6. Confirm no other Access application, bypass rule, WAF exception, or workers.dev route makes an internal family public.
7. Retain the original whole-host application ID where possible by changing its path to `/admin`. The two new applications and policies must be exported after creation for rollback.

### 5.2 Why product route defenses remain required

The application's middleware maintains the public allowlist and protected learner routes ([source](../../academy-web/src/middleware.ts)). After public launch it must continue to:

- allow only intended storefront routes;
- send dashboard/lesson/start visitors through Academy sign-in;
- keep `INTERNAL_SURFACES=on` ([config](../../academy-web/wrangler.jsonc));
- 404 internal surfaces if the switch is turned off during an incident;
- enforce owner/content-staff roles server-side.

AL-02 is a launch blocker because the current baseline's switch only recognizes `/player`; it does not yet cover `/admin`.

## 6. Launch-day sequence

### 6.1 T-2 days — 2026-10-20

1. Complete AL-01..AL-07 review/integration work needed by AL-09.
2. Run AL-09 exactly: database backup, transactional `ROLLBACK` rehearsal, production migration apply/readback, Worker candidate smoke, 100% allocation, and post-deploy smoke.
3. Record §2.3 Worker fields and §2.1/§2.2 protected snapshots.
4. Run a non-mutating Access change rehearsal against an isolated test application, or use Cloudflare's route evaluator/dry-run mechanism if available. Do not rehearse by toggling the production whole-host gate.
5. Confirm the AL-12 hidden-link report has no unresolved navigation 404 for the two launch courses.
6. Obtain the second-provider runbook review and close must-fix findings without weakening a gate.

### 6.2 T-0 — 2026-10-22, before exposure

1. Re-read the serving Worker allocation and ensure it still equals the AL-09 approved version.
2. Re-check retention and private-media evidence has not regressed.
3. Owner applies the eight §4 visibility changes and verifies the catalog while Access remains closed.
4. Founder confirms two-course catalog, hidden-course denials, legal decision, canary mailbox, observer, cleanup owner, and rollback owner.
5. Director-root exports Access a second time immediately before mutation and compares it with the T-2 snapshot.
6. Founder gives the GO naming §4, §5, the canary, and rollback.

### 6.3 T-0 — exposure change

1. Apply §5 exactly: narrow the existing app to `/admin`, create `/api/admin` and `/player` applications, and remove whole-host matching.
2. Read back all three application definitions and policies.
3. Run §7 public/internal probes before announcing anything.
4. If any public route still returns Access, or any internal route does not return Access, stop announcement and execute §8.

### 6.4 T-0 — founder second-account canary

Use one controlled mailbox alias owned for testing, a fresh browser profile, synthetic display data, no purchase, and no marketing consent. Label the identity `prod-playtest-academy-20261022-<run-id>`. The full privacy, cleanup, and evidence contract is [`skills/academy-production-playtest/SKILL.md`](../../skills/academy-production-playtest/SKILL.md).

For **each** launch course:

1. From the public catalog, open the course overview in English and Thai.
2. Press free start, complete the real Account Center sign-in, and return to the intended course.
3. Confirm self-enrolment and open the first lesson:
   - `basic-os-linux/os-what-it-does`
   - `git-essentials/why-version-control`
4. Complete the minimum meaningful action. For Basic OS, exercise English/Thai video and captions without exposing tokens or cookies in evidence.
5. Reload the lesson and prove the resume point/progress survives.
6. Check the required launch viewport **412×915**; also run the skill's standard mobile viewport **390×844**.
7. Return from a fresh signed-in context and prove progress remains account-bound.
8. Sign out and prove protected routes no longer expose the canary session.

Afterwards, revoke temporary entitlement/sessions only through approved product paths, record retained rows and scheduled disposition, and do not directly delete database rows. Ordinary evidence must not contain OTPs, cookies, mailbox contents, tokens, or learner identifiers.

### 6.5 T+1 hour and T+24 hours

- Watch Worker error/invocation logs for 5xx spikes, CSP/browser errors, sign-in callback failures, rate-limit anomalies, and private-media failures.
- Re-run the §7 public route matrix and two-course catalog check.
- Confirm hidden-course direct URLs still fail.
- Confirm one scheduled retention event if the 10:00 +07 run occurs during the observation window.
- Record learner-visible incidents separately; do not use the founder account to claim a new learner journey.

## 7. Launch-day smoke matrix

Use a clean logged-out context. A `Location` to `*.cloudflareaccess.com` is an Access leak for a public row and an Access failure for an internal row.

### 7.1 Public routes

| Route | Required result |
| --- | --- |
| `/` | `200`, no Access redirect. |
| `/courses` | `200`; exactly `basic-os-linux` and `git-essentials`. |
| `/courses/basic-os-linux` and `/en`, `/th` localized URLs | `200`; no Access redirect. |
| `/courses/git-essentials` and `/en`, `/th` localized URLs | `200`; no Access redirect. |
| `/privacy` | `200`; current launch wording. |
| `/sign-in` | `200`; Account Center handoff available. |
| `/auth/callback` without parameters | `400` from Academy with callback validation error; **not** Access `302`. Do not fabricate a real OAuth code/state. |
| `/robots.txt` | `200`; public pages allowed, private path families disallowed. |
| `/sitemap.xml` | `200`; only two launch course locale pairs plus storefront entries. |
| `/dashboard` | redirect to sign-in, not public data. |
| `/courses/basic-os-linux/start` and `/courses/git-essentials/start` | redirect to sign-in with exact `next` path before account creation. |
| Raw workers.dev host `/` | `404` host-gate remains. |

### 7.2 Internal routes

Unauthenticated expected results:

| Route | Required result |
| --- | --- |
| `/admin` | `302` to Cloudflare Access. |
| `/admin/courses` | `302` to Cloudflare Access. |
| `/api/admin/courses` | `302` to Cloudflare Access. |
| `/player` | `302` to Cloudflare Access. |
| `/player/module/cas005-module-1` | `302` to Cloudflare Access. |
| `/player/exam/cas005-full-practice-02` | `302` to Cloudflare Access. |

With an authorized internal session, `/admin/courses` must render only for the owner and `/player` only for content-ops/owner under AL-02. A nonstaff account reaching either page shell is a launch failure even if data is withheld.

### 7.3 Hidden-course matrix

Use the founder/owner account after the public change because the September state says it already has all eight entitlements. For every row in §4.1 marked `unpublished`, require:

| Surface | Exact pattern | Required result |
| --- | --- | --- |
| Overview | `/courses/<slug>` | `404`, absent from catalog. |
| Localized overview | `/courses/<slug>/en` and `/th` | `404`. |
| First lesson | `/courses/<slug>/lessons/<first-node>` | `404` even though the account has an entitlement. |
| Free start | `/courses/<slug>/start` | `404`. |
| Enrol API | `POST /api/courses/<slug>/enrol` | non-success refusal (`404` or the API's sanitized denied status); never `ok:true`. |
| Sitemap | `/sitemap.xml` | no URL for either locale. |
| Existing entitlement | owner readback | entitlement may remain, but effective access must be hidden. |

The exact first-node values are in §4.1 and come from each course source file under [`academy-web/content/courses/`](../../academy-web/content/courses/).

## 8. Rollback

### 8.1 Trigger criteria

Roll back immediately, before further diagnosis or announcement, for any of:

- a public route remains Access-gated after the exposure change;
- `/admin`, `/api/admin`, or `/player` is publicly reachable;
- any hidden course overview/lesson/start/enrol succeeds publicly or with an entitled account;
- wrong catalog shape (more or fewer than the two launch courses);
- authentication/callback, private media, or a P0 security/data-protection failure prevents a safe learner journey;
- the deployed Worker version no longer matches the approved allocation and cannot be restored.

For an active security or data incident, the authorized operator may restore Access first and notify the founder immediately; otherwise founder approval is required.

### 8.2 Rollback order

#### Step 1 — close public exposure at Cloudflare Access

1. Disable or remove the two launch-created `/api/admin` and `/player` Access applications/policies according to their post-create export.
2. Restore the existing application `72f37caa-6573-4898-8bd1-b4aaaba741cc` to its exported whole-host path/configuration and restore its original policy `d5aa4dcf-f77c-4b63-b14f-5c2dc909fff2` if any field changed.
3. If the original application cannot be edited, import the exact protected pre-launch application/policy export rather than leaving a partial state. Do not invent a broader Everyone/Bypass rule.
4. Restore any other host-matching Access application from its pre-launch export.
5. Read back the definitions and require unauthenticated `/`, `/courses`, and `/auth/callback` to return the baseline Access `302` again.

Access rollback succeeds only when the exported application/policy state and public probes match the §2.1 baseline.

#### Step 2 — restore course visibility

Using the owner UI/API, restore every `course_settings` field from the protected §2.2 export. If, and only if, that export proves all eight rows had no runtime visibility override, the exact rollback operations are:

```http
PATCH /api/admin/courses/basic-os-linux
{"visibility":"inherit"}

PATCH /api/admin/courses/git-essentials
{"visibility":"inherit"}

PATCH /api/admin/courses/assembly
{"visibility":"inherit"}

PATCH /api/admin/courses/c-low-level
{"visibility":"inherit"}

PATCH /api/admin/courses/computer-architecture
{"visibility":"inherit"}

PATCH /api/admin/courses/computer-networking
{"visibility":"inherit"}

PATCH /api/admin/courses/operating-systems
{"visibility":"inherit"}

PATCH /api/admin/courses/setup-and-environment
{"visibility":"inherit"}
```

If the baseline contains `published`, `unpublished`, `retired`, null, or title/subtitle/settings overrides, restore those exact values instead of applying the blanket `inherit` sequence. Then re-read all eight rows and effective values.

Visibility rollback succeeds only when the complete post-rollback row set and effective values match the protected baseline export. It does not require deleting entitlements or changing `course_offer`.

#### Step 3 — restore the Worker only for a code/release failure

If the AL-09 Worker itself is defective, use the reviewed pinned release helper to allocate the recorded pre-launch rollback version at `100%`. Do not use `npm run deploy:cf`. Record:

- pre-rollback serving version/deployment;
- restored version/deployment;
- source commit/tag;
- post-allocation public and internal route results;
- reason and time.

Do **not** automatically reverse AL-09 database migrations to make an older Worker run. Follow [`docs/maintenance/academy-operations-runbook.md`](../../docs/maintenance/academy-operations-runbook.md), preserve the AL-09 backup and audit evidence, and treat schema recovery as a separate owner-approved operation.

### 8.3 Post-rollback verification

1. `/`, `/courses`, and `/auth/callback` return the baseline Access redirect.
2. `/admin` and `/player` remain internal.
3. Course settings/effective visibility match the protected baseline.
4. Worker allocation matches the intended restored version (or the approved AL-09 version if only Access/visibility was rolled back).
5. Raw workers.dev still returns `404`.
6. Retention worker remains unchanged and its last event is recorded.
7. Canary sessions/entitlements are revoked or their retained residue and scheduled disposal are recorded.
8. Founder records the rollback outcome as accepted only after all preceding checks pass.

## 9. Evidence and review status

Author verification for this draft:

- **Source PASS:** all repository Markdown targets cited below resolve in this worktree.
- **Source PASS:** course/first-node/media inventory was read from the eight `course.json` files and [`academy-web/src/lib/media/registry.ts`](../../academy-web/src/lib/media/registry.ts).
- **NOT_RUN:** no live HTTP, Cloudflare, Worker, database, account, retention, or R2 command was run; this card is read-only.
- **OPEN:** second-provider omission review and founder approval.

Evidence classification for launch operators must remain explicit:

- **Source PASS** proves only repository/source behavior.
- **Native PASS** requires the actual local Postgres/workerd/browser command named by the owning card.
- **Production PASS** requires canonical-host readback tied to the exact serving version and, for authenticated journeys, real browser evidence.
- **NOT_RUN** and **blocked** are never counted as PASS.

## 10. Source index

- Current maintenance contract: [`docs/maintenance/README.md`](../../docs/maintenance/README.md)
- Production release/version procedure: [`docs/maintenance/academy-production-release.md`](../../docs/maintenance/academy-production-release.md)
- Incident/recovery cautions: [`docs/maintenance/academy-operations-runbook.md`](../../docs/maintenance/academy-operations-runbook.md)
- System topology and current Access-gated description: [`docs/maintenance/academy-system-inventory.md`](../../docs/maintenance/academy-system-inventory.md)
- Last full production state: [`reports/state/2026-09-17-production-state.md`](../state/2026-09-17-production-state.md)
- Access IDs and 302 probes: [`reports/reviews/academy-canonical-domain-deployment-receipt-20260823.json`](../reviews/academy-canonical-domain-deployment-receipt-20260823.json)
- Security findings driving AL-01..AL-05: [`academy-web/reports/security-review-2026-09-19.md`](../../academy-web/reports/security-review-2026-09-19.md)
- Course settings schema/owner API: [`academy-web/supabase/migrations/0039_course_settings.sql`](../../academy-web/supabase/migrations/0039_course_settings.sql), [`academy-web/src/app/(site)/api/admin/courses/[slug]/route.ts`](../../academy-web/src/app/%28site%29/api/admin/courses/%5Bslug%5D/route.ts)
- Audited launch RPC and typed runbook: [`academy-web/supabase/migrations/0043_launch_course_visibility_rpc.sql`](../../academy-web/supabase/migrations/0043_launch_course_visibility_rpc.sql), [`academy-web/ops/runbooks/AL-10.json`](../../academy-web/ops/runbooks/AL-10.json), [`academy-web/ops/launch/course-visibility.mjs`](../../academy-web/ops/launch/course-visibility.mjs)
- Public route policy: [`academy-web/src/middleware.ts`](../../academy-web/src/middleware.ts)
- Internal surface configuration: [`academy-web/wrangler.jsonc`](../../academy-web/wrangler.jsonc)
- Retention contract: [`academy-web/docs/academy-retention-scheduler.md`](../../academy-web/docs/academy-retention-scheduler.md), [`academy-web/ops/academy-retention-worker/retention.ts`](../../academy-web/ops/academy-retention-worker/retention.ts)
- Retention deployment/first-event status: [`reports/academy-retention-api-rollout-2026-08-06.md`](../academy-retention-api-rollout-2026-08-06.md)
- Private media contract/status: [`academy-web/docs/private-media-delivery.md`](../../academy-web/docs/private-media-delivery.md), [`reports/reviews/private-media-remote-activation-2026-08-04.md`](../reviews/private-media-remote-activation-2026-08-04.md)
- Production canary/cleanup authority: [`skills/academy-production-playtest/SKILL.md`](../../skills/academy-production-playtest/SKILL.md)
- Remaining second-account journey: [`reports/handoffs/20260917T081046000Z-2026-09-17-session-close.md`](../handoffs/20260917T081046000Z-2026-09-17-session-close.md)
