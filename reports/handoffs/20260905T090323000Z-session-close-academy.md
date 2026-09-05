# Academy — handoff at session close, 2026-09-05 (Bangkok ~18:20)

Any agent can resume from this file alone. Read `AGENTS.md`, `PENDING_USER_ACTION.md`,
`plans/active_plan.md`, then this. No live authority is carried here.

## Production right now

- Worker `cyberskills-academy` version `d4717406…` @100% = source `594dede` (main `02c712e` is 3
  docs/preflight commits ahead; runtime identical). Canonical `academy.cyberskills.co.th` behind
  Cloudflare Access; raw `cyberskills-academy.songpon-te.workers.dev` still answers unauthenticated
  (fix on branch, not deployed — see below).
- Data plane: PostgREST `academy-data.cyberskills.co.th`, Pool A schema `academy`, migrations 0001–0028.
- Status: **BLOCKED on the owner sign-in journey** — the founder tested today and reported
  "login แล้วติด loop กลับมาหน้าขอให้ login อีกรอบ". The security triage found the likely cause
  independently: `src/middleware.ts:105-113` in production redirects every non-public path to
  `/sign-in` without consulting `academy_session` (SEC-ACADEMY-002). The `academy-loop` lane was
  stopped before it committed; treat the root cause as **probable, not proven** — reproduce with a
  unit test under `NODE_ENV=production` first (the fix shape from the triage: production prefilter
  branch + `/api/auth/me` through the production store, `currentUser()` stays the decider).

## Branches and worktrees (pushed)

| branch | worktree | contents |
|---|---|---|
| `harden/2026-09-05` @ … | `/private/tmp/academy-harden` | `c6a67e0` canonical-host gate (`src/lib/edge-host-policy.ts`, `ACADEMY_SERVED_HOSTS` override, tests), `26aa3ad` security checklist, this handoff |
| `content/import-secplus-isc2cc` @ de1fd32 | `/private/tmp/academy-content-import` | Security+ SY0-701 (28 nodes) + ISC2 CC (30 nodes) imported, `publicAvailability: internal`; registry regenerated; content tests 37/37, unit 2356/2356, lint = main baseline (3 errors); `reports/reviews/2026-09-05-glm-factcheck/` (11 course results) |
| 8 older unmerged branches (2026-08-29…09-04) | listed in `git branch --no-merged origin/main` | foreign, retained |

## Plan to "real paying learners" (ordered)

1. **Fix the sign-in loop** on `harden/2026-09-05` with a failing-then-passing unit test; deploy:
   `npm run build:cf` → `wrangler versions upload --keep-vars` → smoke on the new version → `wrangler
   versions deploy` (docs/maintenance/). Then the founder does the fresh-OTP journey to `/dashboard`
   (PENDING §1). Keep the host gate commit in the same deploy (it closes the workers.dev bypass;
   declare a probe host in `ACADEMY_SERVED_HOSTS` only while probing).
2. **Staff bootstrap + entitlement** (PENDING §1 steps): `scripts/manage-staff-role.mjs` dry-run then
   `--apply`; grant `academy.course_entitlement` for the founder; build the admin grant path so the
   psql write is no longer the only way (`grantCourseEntitlement` at `src/lib/account/access.ts:65`
   has no caller).
3. **Payment** — the founder has not answered whether launch requires it (question asked 2026-09-05).
   Nothing exists in src (`purchase` source has no writer). Decide provider (Omise/Stripe) or ship
   manual entitlement for B2B/university cohorts first.
4. **Hardening batch** from `reports/security/2026-09-05-security-review-checklist.md` (25
   CONFIRMED): SEC-ACADEMY-001 (+005) rate limit + bounded body on `/api/auth/identity/start` and
   `/auth/callback` **before** Access is removed; -003 lifecycle/suspension propagation + revoke-by-
   principal RPC; -004 `currentUser()` must not resurrect deleted users or revert emails; -006 capstone
   bank/backoff/alert + production clamp on `ATTEMPT_MAX_PER_WINDOW`; CSP `unsafe-inline` (next.config).
5. **Content**: fix the 8 existing courses from `reports/reviews/2026-09-05-glm-factcheck/*.json`
   (CRITICALs: basic-os-linux 1, git 1, c-low-level 2, operating-systems 2, computer-architecture 1,
   computer-networking 3, assembly 1) — these courses are authored in this repo; apply en+th together,
   keep keys unless proven wrong, rerun the content tests + `checkpoint-answer-bias` gate. Then reduce
   the Sec+/CC longest-option rates (56%/78%) by rewriting distractors in the Crucible packages and
   re-importing (`skills/course-content-import` in the director repo describes the procedure).
6. **Visibility**: flip `publicAvailability` for Sec+/CC in the Crucible package (`syllabus-preview`
   then `public`) and re-import; certificates (`src/lib/course/certificate-claim.ts:14`) and legal
   text (PENDING §3) before public launch; Zero Trust review to remove Access (PENDING §2).
7. **UI polish** (founder's item 1): not started for Academy; use the Crux design direction the
   founder picks as the family look.
8. **Maintenance & deployment guide** (founder's item 5): `docs/maintenance/academy-system-inventory.md`
   + `academy-secret-registry.md` exist — extend with the version-upload/deploy procedure and a key
   table whose names/locations come from a founder sitting.

## Verify after each deploy (GET-only)

```
wrangler deployments list --name cyberskills-academy | head            # version + tag release-<sha12>
curl -sS -o /dev/null -w '%{http_code}\n' https://cyberskills-academy.songpon-te.workers.dev/   # 404 after the host gate
curl -sS -o /dev/null -w '%{http_code}\n' https://academy.cyberskills.co.th/robots.txt          # 200
```
