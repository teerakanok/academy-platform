# Academy production deploy record — 2026-09-12 (recovery candidate 73ac223)

Deploy lane: controller session ws-523a1d40, sole writer of worktree
`continuations/academy-security-recovery-20260912-523a1d40`, branch
`codex/academy-security-recovery-523a1d40` (worktree HEAD `6d3f528`; application
source commit `73ac2232b2423c52651a6d7f575a95b18eb6f4db`; controller activation
head `1ac988f` on the director state worktree).

Authority: `deploy_playtest_authority_20260912_evening` in
`cyberskills-director/reports/security/identity-recovery-523a1d40/current-owner-authority-20260912-1531-addendum.json`
(extending `current-owner-authority-20260912.json`, Academy deploy-when-ready).
All timestamps below are UTC.

## Outcome

Production Academy (`academy.cyberskills.co.th`) serves recovery candidate
source `73ac2232b242…` as Worker version `73cc26e6-f084-458f-a5aa-0ae6b5623518`
at 100% since 13:35:33Z, on top of Pool A migrations 0040/0041/0043/0044
committed 13:35:22Z. Read-back verification passed on every item (below).
No secret value entered model context, logs, or this record.

## Production state before this deploy

- Serving Worker version `509c93a8-49e6-4ab2-b9a4-ebee6737da51` @100%
  (deployed 2026-09-11T12:13:41Z). Immediate rollback predecessor:
  `7c54107b-358f-4ccb-a4bd-49af27f7c46d`.
- Existing version secrets (names only, inherited via `--keep-vars`):
  ACADEMY_DATA_API_JWT_SECRET, ACADEMY_DATA_API_URL,
  ACADEMY_IDENTITY_DIAGNOSTIC_NONCE, IDENTITY_ADAPTER,
  IDENTITY_CLIENT_ASSERTION_KEY_ID, IDENTITY_CLIENT_ASSERTION_PRIVATE_JWK,
  IDENTITY_CODE_EXCHANGE_TIMEOUT_MS, IDENTITY_RELEASE_APPROVAL,
  IDENTITY_RESULT_KEY_SET_DOCUMENT, IDENTITY_RUNTIME_ENABLED,
  IDENTITY_RUNTIME_WIRED, MEDIA_SIGNING_SECRET, RATE_LIMIT_KEY_SECRET.
- Pool A `academy` schema: migrations 0029–0039 verified applied by live
  catalog read (0037 `progress_write_allowed` prosecdef=t; 0038
  `course_certificates` and 0039 `course_settings` tables present). Pending:
  0040/0041/0043/0044 (0042 intentionally reserved). `identity_session`=0
  rows, `leads`=0 rows. `postgres` is NOSUPERUSER; `supabase_admin` is the
  superuser (documented operator fact).

## Backup (before any shared-DB mutation)

- `/root/academy-db-backups/20260912T133022Z-recovery-0040-0044/academy.dump`
  (on ssh-db.cyberskills.co.th), `pg_dump -U postgres -d postgres
  --schema=academy -Fc`, schema+data.
- 281,697 bytes, mode 0600, sha256
  `f75c0777540e6d0e4ea6ae9a10bd1b432228f913ddc75d334f3649e0d3ee92fa`.
- Archive listing verified: 393 entries, 23 TABLE DATA. (Matches the
  0034-cutover receipt pattern; not a new restore drill — the separately
  proven P0A-4 restore drill remains the restore evidence of record.)

## Migration rehearsal (disposable PostgreSQL)

`node scripts/test-pending-waitlist-postgres.mjs` from `academy-web`:
owned disposable pinned-image container, full 43-migration train applied in
order (…0039, 0040, 0041, 0043, 0044 + privileged retention owners),
`Pending waitlist PostgreSQL checks passed: 5`, container self-cleanup
verified. Pre-existing foreign containers untouched.

## Worker build and upload

- `npm run build:cf` exit 0: OpenNext build, cache sync (39 prerender
  assets), asset guard pass, real-workerd final startup check pass
  (`PASS final OpenNext Worker initialized on real workerd; raw-host/static
  gate HTTP 404; maintenance rejects before bindings; open assets preserve
  cache; scheduled recovery remains reachable; outbound requests blocked;
  bundle 16017.6 KiB`).
- `wrangler versions upload --name cyberskills-academy --keep-vars --tag
  release-73ac2232b242 --message
  's=73ac2232b2423c52651a6d7f575a95b18eb6f4db;recovery-admission-lifecycle-privacy'`
  → Worker Version ID `73cc26e6-f084-458f-a5aa-0ae6b5623518` (12.95 s).
  Bindings read back at upload: EDGE_RATE_LIMITER (DO), COURSE_MEDIA (R2),
  ASSETS, NEXT_PUBLIC_SEARCH_INDEXING=on, ACADEMY_ADMISSION_MODE=open.
- 0% split: `versions deploy 509c93a8@100 73cc26e6@0` — SUCCESS (1.82 s).
- Override smoke (header `Cloudflare-Workers-Version-Overrides:
  cyberskills-academy="73cc26e6-…"`): canonical `/` 200 (HTML,
  cache-control private,no-store; nonce CSP preloads), raw host `/` 404,
  canonical `/robots.txt` 200. Pre-activation early warning only; final
  attribution comes from the allocation receipt + postchecks below.

## Pool A migration apply (0040 → 0041 → 0043 → 0044)

Body: the four migration files in order, executed from an authorized
`supabase_admin` connection (`docker exec -i supabase-db psql -X -U
supabase_admin -d postgres -v ON_ERROR_STOP=1 -At`), `BEGIN; SET LOCAL ROLE
postgres;` so object ownership stays `postgres`, followed by in-transaction
postcondition SELECT. Body sha256: rollback variant
`f9de5169…` is commit variant `65adb162…` — both retained on the server
alongside the backup (`body-rollback.sql`, `body-commit.sql`, fingerprints
`baseline-schema.sha256`, `after-rollback.sha256`, `after-commit.sha256`).

One documented-pattern deviation was required: 0043's `revoke execute on
function academy.checkpoint_identity_authorization_exchange(…) from
academy_runtime` fails under `SET LOCAL ROLE postgres` because that legacy
function is owned by `supabase_admin` (historical apply; all other touched
objects are `postgres`-owned). Following the documented operator pattern
(reset role only for the exact privileged statement), the body executes
`RESET ROLE;` → that single REVOKE → `SET LOCAL ROLE postgres;`. No other
statement differs from the reviewed migration text. First rehearsal attempt
without this wrap aborted cleanly at exactly that statement (baseline
unchanged), which identified the ownership fact.

1. In-window ROLLBACK rehearsal: output `academy_0040_0044_postconditions_pass`,
   then `ROLLBACK`; academy schema-only fingerprint after = baseline
   `89bc263b45636c925efc5f3dc27ad4eaafe536aaa87f7a338f9da72fb2c432ec`
   (unchanged — clean rollback proven).
2. COMMIT at 13:35:22Z: output `academy_0040_0044_postconditions_pass`,
   `COMMIT`; after-fingerprint
   `d7ce0eaa11905b44af1a05189991f4f8c6200c45ab13ff29336884236a19cb82`.
   `pending_waitlist_requests`=0 rows, `identity_lifecycle_authorization_fences`=0 rows.
3. Postconditions asserted in-transaction (and true of committed state):
   both new tables exist with RLS enabled; `identity_session` has
   authentication_method/authentication_time/last_seen_at;
   `identity_authorization_transaction` has result_authentication_time;
   v2 functions (`create_identity_session_digest_v2`,
   `checkpoint_identity_authorization_exchange_v2`, `inspect_attempt_reauthentication`,
   `peek_identity_session_digest`) exist; `academy_runtime` granted execute on
   v2 create/checkpoint/inspect/peek/read/record_pending_waitlist_request/
   identity_lifecycle_allows_profile_activation/fence_identity_lifecycle_page_failure;
   legacy `create_identity_session_digest`, `create_identity_session`,
   `checkpoint_identity_authorization_exchange`, and `record_lead_consent`
   revoked from `academy_runtime`.

Cutover window: 0043 revokes the legacy session-create grants the previous
Worker used, so sign-in would fail between COMMIT and candidate activation.
`identity_session` had 0 rows (no live sessions). Candidate was pre-uploaded
and pre-split; activation completed 13 s after COMMIT (see below).

## Activation

`wrangler versions deploy 73cc26e6-f084-458f-a5aa-0ae6b5623518@100 --name
cyberskills-academy --message 'activate;s=73ac2232b2423c52651a6d7f575a95b18eb6f4db;prev=509c93a8-49e6-4ab2-b9a4-ebee6737da51' --yes`
→ SUCCESS at 13:35:33Z (1.43 s). Allocation receipt
(`wrangler deployments list`, latest entry): Created 2026-09-12T13:35:33.597Z,
Version `73cc26e6-f084-458f-a5aa-0ae6b5623518` (100%), tag
`release-73ac2232b242`. Predecessor `509c93a8-…` retained (inactive).

## Read-back verification (post-activation, 13:36–13:45Z)

| Check | Result |
| --- | --- |
| Allocation receipt | 73cc26e6 @100% (13:35:33Z deployment) |
| Deployed vars (`versions view 73cc26e6`) | ACADEMY_ADMISSION_MODE=`"open"` (exact), NEXT_PUBLIC_SEARCH_INDEXING=`"on"` |
| Raw host `/` | 404 (host gate) |
| Raw host `/_next/static/css/c028724d695f0bbb.css` | 404 (worker-first before assets) |
| Canonical `/` | 200 `text/html`, `cache-control: private, no-store`, CSP `script-src 'self' 'nonce-…'` + report-uri (candidate nonce CSP live) |
| Canonical `/robots.txt` | 200 `text/plain` |
| Canonical `/sitemap.xml` | 200 `application/xml` |
| Canonical `/sign-in` | 200 |
| Canonical course pages | `/courses/assembly/en` 200, `/courses/assembly/th` 200, `/courses/basic-os-linux/en` 200, `/courses/basic-os-linux/th` 200 |
| Canonical static asset (worker-first, cached) | 200 `text/css` |
| Admission gating | Deployed mode exactly `open` and canonical serving 200 (fail-open path live); fail-closed 503 maintenance behavior proven by the real-workerd startup check in this build |
| Log delivery + invocation cost | `wrangler tail` live records: `/sign-in` outcome ok (wall 29 ms / cpu 22 ms), `/robots.txt` outcome ok (wall 18 ms / cpu 8 ms); observability enabled |
| Committed DB state | postconditions PASS; schema fingerprint 89bc263b… → d7ce0eaa…; new tables 0 rows |

## Rollback path (documented, not executed)

- Worker only: `wrangler versions deploy
  509c93a8-49e6-4ab2-b9a4-ebee6737da51@100` restores the prior public
  serving surface immediately, but sign-in on that version depends on the
  legacy session-create grants that 0043 revoked — worker-only rollback
  leaves sign-in broken. (Further rollback predecessor `7c54107b-…` predates
  the public-launch vars; do not use blindly.)
- Full recovery: worker rollback plus Academy-scoped restore from the fresh
  backup above — separately authorized recovery work per the 0034-cutover
  boundary (never a routine compensation, never blind schema rollback; the
  0041/0043 durable denial guards must not be resurrected-away). With
  `identity_session`=0 rows there is no learner session data at risk.
- Forward-fix remains the preferred path for sign-in issues (see open items).

## Open items and honest limits

- Live end-to-end sign-in was not proven in this lane. The candidate's
  session-create path calls `create_identity_session_digest_v2` with an
  `auth_time` that must arrive in Identity's v2 assurance envelope; the
  Identity production enablement is the parallel lane under the same owner
  deploy order, and real-browser cross-product sign-in/sign-out playtests are
  the controller wave per the handoff. `identity_lifecycle_consumer_checkpoint`
  is empty and projections are 0 (fail-closed by design until the lifecycle
  producer is configured) — this denies nothing today because no sessions
  exist, but first-login wiring at rollout time remains scaffolding-labeled.
- Lifecycle pull (`IDENTITY_LIFECYCLE_*`) and the retention worker remain
  disabled/owner-gated exactly as before; this deploy changed neither.
- Measured invocation cost from tail samples: 8–22 ms CPU (limit 500 ms).
- The 9 privacy owner-facts still block final privacy copy (unchanged).
- Side effects disclosed: none on pre-existing containers/services
  (disposable rehearsal container self-cleaned; caffeinate PID 15262
  untouched; no branch push — deploy used the local build only). Server-side
  residue is intentional evidence: backup + body files + fingerprints under
  `/root/academy-db-backups/20260912T133022Z-recovery-0040-0044/`.

## F-2 lifecycle convergence — 2026-09-13 (controller-executed after lane quota failure)

Chain of three real defects found and fixed in production (each verified by bounded observability deployed through the documented versions-upload + activate flow, focused tests 14/14 + build PASS each round):
1. `fetch` illegal invocation — Modules-worker global fetch called with explicit receiver in the pull response transport; fixed by binding to globalThis in the worker runtime composition.
2. Envelope signer issuer mismatch — publisher signs envelope `iss` = `https://accounts.cyberskills.co.th/` (production-lifecycle-publisher.json publisher.issuer) while the consumer pinned `https://supabase.cyberskills.co.th/auth/v1` (that is the *principal* issuer carried inside each event, a different concept). Consumer policy + verification key set document + tests now pin the envelope signer issuer.
3. `permission denied for function sync_service_activation` (SQLSTATE 42501) — the leased-commit SECURITY DEFINER chain executes as `postgres`, but migration 0013/0019 grants never included `postgres` (only academy_runtime/academy_activation_writer). Granted EXECUTE on academy.sync_service_activation(uuid,text,integer) to postgres via supabase_admin; ACL read back {academy_activation_writer=X, academy_runtime=X, postgres=X}.

Convergence evidence (read-back): scheduled pulls every */5 cron now log outcome=committed cursor=7 health ready; academy.identity_lifecycle_consumer_checkpoint cursor_sequence=7 configuration_health=ready; 7 durable projections state=active; identity_control.lifecycle_outbox_deliveries sequences 1-7 assigned; outbox_consumers academy-web acknowledged_sequence=7. published_at remains 0 by design until every registered consumer (incl. crux-control, not yet wired) acknowledges — Crux-side pull wiring stays an owner item.

Bounded observability retained in worker: scheduled outcome log, transport non-200/network error log, page error log, store read/commit error log (codes+messages only; no secrets/payloads). Rollback: `wrangler versions deploy <prev>` (config-only revert of vars), plus the single EXECUTE grant is additive and inert without the pull.
