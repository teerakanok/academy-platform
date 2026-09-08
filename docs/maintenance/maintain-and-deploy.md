# Maintain and deploy Academy

Current application source `fe4220a1850d277d542cd5e30f38360776df4b15` fixes the
reported Account Center return/sign-in loop. See the
[actual owner login proof](../../reports/verification/2026-09-08-active-user-shape/README.md),
[0035 activation repair](../../reports/verification/2026-09-08-activation-repair/README.md),
and [0036 audit inspection activation](../../reports/verification/2026-09-08-audit-inspection-0036/README.md).
The [current handoff pointer](../../reports/handoffs/current.json) remains the
prior session-close pointer until lifecycle finish; these dated verified records
supersede its historical release IDs. The
[0034 cutover record](../../reports/operations/20260906-academy-0034-cutover/README.md)
remains authoritative for its consumed migration and recovery boundary.

## Current verified boundary

- Deployment `3ecc5f51-2c30-4ce1-86c9-cdd2fb076b1a` serves Worker version
  `3830694b-bca9-4035-8bd0-e853ee6dd1fa` at100%, sourcefe4220a,
  activated2026-09-08T04:51UTC. Root observed owner Safari Dashboard and
  signed-in API after activation. Safari Dashboard remained authenticated after
  the Identity release at07:12:54UTC. Original sign-in-loop SEC002 is closed.
  This does not establish entitlement or persistent learner progress.
- SQL0035 repaired bounded runtime activation/session authorization; SQL0036
  added two dedicated-operator latest-audit read functions. Both had production
  ROLLBACK rehearsal before COMMIT and separate readback; do not replay either.
  Neither receipt grants founder staff role or course entitlement by itself.
- Staff/entitlement CLIs now support inspect, exact mutation ROLLBACK rehearsal,
  and apply. Dedicated roles `academy_staff_admin` and
  `academy_entitlement_operator` need owner-supplied new DB passwords through0600
  files. These are not Mac/Google/Cloudflare or learner login passwords.
  Do not bypass direct-role login with an admin connection plus SET ROLE.
  Bind the canonical account issuer/subject from authoritative Identity evidence,
  never email equality, then use the scoped staff/entitlement operator runbooks.
- Accepted/imported/deployed capstone banks:23/23. Production HTTP25/25 and real
  Chrome EN/TH desktop/mobile captures passed. This does not close authenticated
  learner submission, entitlement, payment or complete playtest acceptance.
- Migration `0034_identity_session_id_digest.sql` is committed. Its digest RPCs
  and grants are live. Do not reapply migrations `0029`–`0033` or `0034`.
- The legacy raw session create/read/revoke wrappers remain compatible, but old
  claim/finalize paths are disabled. Only a reviewed digest-compatible
  application rollback may be considered.
- Never deploy the old `90c390b5…` raw-session application after `COMMIT`, or
  after a COMMIT with unknown transport outcome. Do not restore the retained
  backup as routine compensation; Academy-scoped restore is separately
  authorized recovery work.

Do not conflate a routine application deploy with a migration cutover. Routine
deploys preserve database compatibility. A migration cutover requires an exact
reviewed packet, a fresh protected backup, an in-window `ROLLBACK` rehearsal,
recorded abort/forward commands, drain evidence, and explicit COMMIT gates. The
consumed 0034 packet is evidence, not a replayable procedure.

## Authority and evidence

- Production, database, deploy, and credential authority comes from the separate
  authorization record, never from this guide or a receipt copy.
- Read [shared infrastructure rules](./README.md) and the
  [component runbook](./academy-operations-runbook.md) before maintenance.
- Record sanitized commands, exit codes, immutable IDs, hashes, safe booleans and
  counters. Do not print ordinary vars, backups, SQL payloads, cookies, tokens or
  unfiltered Wrangler metadata; inherited credentials must remain in place.
- The documented lint baseline is exactly three `no-require-imports` errors in
  `academy-bound-worker-executor.cjs`. Do not run expensive application gates for
  documentation-only changes; use the documentation evidence gate.

## Prepare the application candidate

1. Start through the lifecycle/router, read the current handoff and authorization
   boundary, and use one owned worktree/writer.
2. Author content only in Crucible. Import immutable content mechanically,
   regenerate the registry, and run the required content/roadmap/registry and
   checkpoint-answer gates before any course import.
3. Start with failing-first evidence for application fixes. Run from
   `academy-web`: `npx vitest run --project unit` and `npm run lint`. The lint
   result must retain the exact three-error baseline above.
4. Obtain independent review of the actual auth/security/data/production
   changes before the application commit. Bind that review to file hashes.
5. Run the monitored build/deploy in the background and record start/end, exit
   status, source SHA, warning count, skipped tests and immutable version IDs.

## Routine application deploy

Run from `academy-web` with the repository Wrangler. Replace only the marked
placeholders with observed immutable identifiers and the reviewed source SHA.
The Worker exports a Durable Object, so use upload, a 100/0 deployment split,
version-header smoke checks, then activation.

```sh
rtk proxy npm run build:cf
rtk proxy node node_modules/wrangler/bin/wrangler.js versions upload --name cyberskills-academy --keep-vars --tag release-<sha12> --message 's=<full-source-sha>;release-purpose'
rtk proxy node node_modules/wrangler/bin/wrangler.js versions deploy <previous-version>@100 <candidate-version>@0 --name cyberskills-academy --message 'candidate-smoke;s=<full-source-sha>' --yes
```

For a candidate GET, set this exact header with the candidate UUID:

```text
Cloudflare-Workers-Version-Overrides: cyberskills-academy="<candidate-version>"
```

Verify raw-host denial, canonical Access behavior, static assets and expected
application behavior before activation. Do not treat a status code or Access
redirect as a learner-session proof, and do not resend an OTP automatically.
After the smoke passes:

```sh
rtk proxy node node_modules/wrangler/bin/wrangler.js versions deploy <candidate-version>@100 --name cyberskills-academy --message 'activate;s=<sha>;prev=<previous-version>' --yes
```

Recheck without the override, verify the exact version is at 100%, and retain the
predecessor and inactive candidate. For a compatible app rollback, deploy only
the observed verified predecessor at 100% and verify its expected behavior first.
Never blindly roll back across the 0034 schema boundary.

## Digest-cutover recovery boundary

The cutover maintenance deployment `8d62fbf9-c51f-4bbd-bfb5-401f83b97a5b` served
disabled-runtime maintenance version
`f126b6ac-7e3e-4f47-9990-1716b4c106ba` at 100% and reviewed digest candidate
`bd109c61-ddda-46c3-8d27-6cedc3365394` at 0%. The operator recorded both forward
and abort commands before maintenance. Drain checks reached zero active claims
and zero held identity-table locks; a fresh schema-plus-data backup and an exact
in-window ROLLBACK passed before COMMIT. Commit changed the Academy schema hash
from `003eb7…` to `711417a0…`; see the
[backup receipt](../../reports/operations/20260906-academy-0034-cutover/receipts/academy-0034-fresh-backup.json),
[rollback receipt](../../reports/operations/20260906-academy-0034-cutover/receipts/academy-0034-maintenance-rollback.json)
and [COMMIT receipt](../../reports/operations/20260906-academy-0034-cutover/receipts/academy-0034-production-commit.json).

Before COMMIT, or after a proven ROLLBACK, the separately authorized abort path
could restore the old application and schema state. After COMMIT or uncertain
COMMIT, query the marker/schema/state first and retain the maintenance runtime;
do not auto-retry COMMIT and do not return to old `90c390b5…`. The exact packet
is consumed and non-idempotent.

With the runtime flag disabled, direct deployment of older `bd109…` failed
Cloudflare `10220` because `IDENTITY_RUNTIME_ENABLED` differed. Do not use
`--use-version`, force, or an API override. The verified recovery inspected the
latest uploaded version, confirmed the reviewed source/runtime and all 17 binding
names/types, then patched only the inherited boolean flag with the documented
standard-stdin path; no credential value or file was copied.
In this template context, the literal `true` is the reviewed noncredential
feature flag—not a secret and not inherited from the caller's environment.

```sh
printf '%s\n' true | rtk proxy node node_modules/wrangler/bin/wrangler.js versions secret put IDENTITY_RUNTIME_ENABLED --name cyberskills-academy --message 's=<full-source-sha>;resume-reviewed-digest-runtime'
```

This creates a new version from the latest version; it does not patch an
arbitrary historical version. Inspect the new version before deployment: script
must match the reviewed candidate, assets/runtime payload must match, and there
must be exactly the reviewed 17 bindings. Then activate it at 100%:

```sh
rtk proxy node node_modules/wrangler/bin/wrangler.js versions deploy <flag-patched-version>@100 --name cyberskills-academy --message 'Resume reviewed digest runtime after verified 0034 COMMIT' --yes
```

The actual resumed parity check is retained in the
[runtime resume receipt](../../reports/operations/20260906-academy-0034-cutover/receipts/academy-cutover-runtime-resume-version.json)
and [parity receipt](../../reports/operations/20260906-academy-0034-cutover/receipts/academy-cutover-resume-runtime-parity.json).

## Post-deployment evidence

Count proof only when status, content type/body behavior and host gate all agree.
Canonical `/` and `/sign-in` must return 200; the raw `workers.dev` root must
return 404. A plain canonical `/robots.txt` GET can return an Access-login body
despite HTTP 200; that is not product proof. Use authenticated Access curl with
an absolute request target:

```sh
rtk proxy cloudflared access curl https://academy.cyberskills.co.th/ --request-target /robots.txt -sS -i --max-time 20
```

The verified result was `text/plain` 200 with robots directives and no
Access-login body; see the
[corrected robots receipt](../../reports/operations/20260906-academy-0034-cutover/receipts/academy-robots-canonical-authenticated.json)
and [postverify receipt](../../reports/operations/20260906-academy-0034-cutover/receipts/academy-cutover-production-postverify.json).
The browser Continue action reached Account Center email/Turnstile, but no email,
challenge/OTP, fresh learner callback, active-cookie persistence, entitlement,
progress, or sign-out journey was performed by this cutover.

## Payment, entitlements and content

The payment provider remains undecided; do not create accounts or publish a
payment flow by assumption. Manual entitlement remains a separately auditable
capability and does not by itself imply payment acceptance.

Crucible remains the content source of truth. Preserve portable structured
content and run the required content/roadmap/registry and checkpoint-answer gates
before any course import. Imported catalogue visibility must not grant access or
expose protected lessons/media; never repair delivery by making a bucket public.

## Key inventory — final owner sitting pending

Do not populate this table from credential values or request Bitwarden. Existing
historical registry entries are not a verified current custody/rotation
inventory. Fill names, locations and rotation decisions only with the owner at
the final sitting; never secret values.

| Key name | Stored where | Rotate when | Owner |
|---|---|---|---|
| | | | |

## Current acceptance limits

The current application and migrations0034–0036 have verified deployment receipts.
Real owner sign-in and authenticated Dashboard are accepted, including the
post-Identity-release observation linked above. Fresh learner callback, staff/
entitlement, progress persistence and full sign-out remain pending. Do not infer
these remaining journeys from HTTP status, a build or committed migration. Track
other open security work in the dated security checklist.
