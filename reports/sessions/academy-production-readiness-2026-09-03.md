# Academy Production Readiness Checkpoint

Status date: `2026-09-03`

## Update (2026-09-03, late)

- Callback fix `71b41b4` merged with `main` as `b3d4180` and deployed: Worker
  version `4ff2077a-fa56-4ea5-91f8-0b57981ee573`, tag `release-b3d4180fcf2d`,
  deployment `259282a3-fc2e-4d8d-a1e1-2d58bae97770`, `100%`. Previous version
  `bd4aea53-9137-4d49-a5f4-3a74be959736` remains the rollback target.
- Path used: `opennextjs-cloudflare build` -> `wrangler versions upload --keep-vars`
  (`0%`) -> split deploy `100/0` -> smoke through the
  `Cloudflare-Workers-Version-Overrides` header (`BUILD_ID` matched the local
  build; `/` `200`, `/courses` `200`, `/auth/callback` `400`) -> `versions deploy
  4ff2077a@100`. No macOS root installer, no secret was read or set.
- Merged-source evidence: unit `2,121/2,121`; `tsc` app and worker exit `0`; build
  exit `0`; eslint only the three known `.cjs` `no-require-imports` errors.
- Pool A read-only check: `academy.identity_authorization_transaction` has the
  `0028` lease columns and the four new functions with `academy_runtime` execute;
  `pgrst_ddl_watch` event trigger exists, so the dedicated PostgREST reloaded its
  schema. `academy.users` = `0`, `staff_role_assignment` = `0`.
- Remaining: owner-present sign-in journey (see `PENDING_USER_ACTION.md` §1).
  Status stays `BLOCKED` until that journey passes.

## Real-dependency audit (2026-09-04, after two "green in tests, dead on the runtime" incidents)

Evidence classes: `live` = executed against the real dependency in production
this session; `workerd` = executed on real workerd by `scripts/workerd-signer-check.mjs`
(11/11); `pg` = real-Postgres integration test (`tests/integration`); `static-live` =
call shape compared against the live database (function identity arguments, grants,
`rolbypassrls`); `mocked` = unit tests only.

| Path | Dependency call shape | Evidence |
|---|---|---|
| Edge rate limit | Durable Object `getByName().check()` | live (earlier 400x10 → 429 receipt) |
| Sign-in start | PostgREST RPC `create_identity_authorization_transaction` via supabase-js + runtime JWT | live |
| Callback claim/release | RPC `claim_…`, `release_…_claim` | live |
| Client assertion | `crypto.subtle` ECDSA P-256 sign, 64-byte raw | live (Identity replay row) + workerd |
| Code exchange fetch | `fetch` with `cache:'no-store', credentials:'omit', redirect:'manual'` | live (200/404) + workerd (init accepted; `'error'` proven to fail) |
| Exchange body read | `ReadableStreamBYOBReader` bounded JSON | live (200 body parsed to the issuer check) |
| Result verification | key-set import, ECDSA verify, `structuredClone` | workerd (Identity-shaped fixture); live pending owner OTP |
| Exchange checkpoint/finalize | RPC `checkpoint_…`, `finalize_…` | pg + static-live |
| Session create/read/revoke | RPC `create_identity_session`, `read_…`, `revoke_…`; cookie `academy_session` | read: live (bogus cookie → 307); create/revoke: pg + static-live |
| Profile activation, `academy.users` upsert | RPC `sync_service_activation`; table `users` insert/update | pg + static-live (grants I/S/U, bypassrls) |
| Entitlement | RPC `has_course_entitlement`; table `course_entitlement` | pg + static-live |
| Progress write/read | RPC `record_node_progress`, `capture_progress_epoch`, `commit_node_progress`, `reset_course_progress`; table `node_progress` | pg + static-live |
| Attempts | RPC `issue/consume/inspect/finalize_attempt`, `commit_attempt_result` | pg + static-live |
| Private media | HMAC grant cookie, R2 `get(key, {range: Headers})`, streamed 200/206 | workerd (local R2) + live bucket read of a registry key (416-byte VTT) |
| Leads/consent | RPC `record_lead_consent`, `withdraw_marketing_consent` | static-live |
| JSON charset, notices | Worker response wrapper | live |

All 27 RPC call sites match the live function identity arguments and `academy_runtime`
has execute on each; every table the journey writes has the needed grants. Residual
unknowns: real-R2 range semantics beyond the emulator, and the post-callback RPCs that
only a real session can drive (they run live at the founder's next sign-in; every
failure now logs its stage).

## Exact status

Academy is `BLOCKED`, not production-ready. Public and runtime health remained
stable at the last direct revalidation, and the shared Identity OTP ambiguity
fix is active. The customer-critical failure is later in the journey: a valid
Academy code verification did not reach callback/session creation because the
Academy client assertion was not admitted by Identity Control.

Do not send or resend another OTP until the resident Worker assertion key is
classified and the resulting correction passes production postchecks.

## Last directly revalidated production baseline

- Academy Worker deployment:
  `20f58559-daa8-4b77-81f7-7885686c1a14`.
- Academy Worker version:
  `bd4aea53-9137-4d49-a5f4-3a74be959736`, `100%` traffic, tag
  `release-646206ed7cdd`, CPU limit `500 ms`.
- Shared Identity release:
  `60920c9cc08bae2befc22f5c8ddbce5f678fefe9`.
- GoTrue request deadlines: ordinary `5,000 ms`; OTP start `10,000 ms`;
  Account Center outer `15,000 ms`.
- Canonical Academy root/courses/callback: expected Cloudflare Access `302`.
- Raw Academy Worker and Account Center health: `200` at the same baseline.

The current Academy repository HEAD
`eb99d9d58f2fe59a0998f2d5dc07842aca0b839d` contains reviewed diagnostic
tooling only. It is not the active Worker version and has not been deployed.

## OTP and mail behavior now active

The shared Identity release persists post-dispatch transport timeout or response
loss as recoverable `ambiguous`, rather than terminal send failure. It forbids an
automatic resend, retains the encrypted provider reference, permits bounded
verification of the original code within the challenge TTL, and finalizes only
once. Expiry, replay, and exhausted attempts fail closed. The retained database
constraint also prevents an older runtime from resending after rollback.

The new/existing-user email templates are code-only and byte-identical. They
contain the one-time code but no confirmation URL, token hash, backend host,
product callback, or recipient. The browser cannot choose the redirect; the
server owns the exact Account Center return. Academy and STAR remain isolated.
Two separate fresh Turnstile proofs and server-enforced GoTrue CAPTCHA remain
mandatory.

The previously exposed confirmation token was revoked once through the reviewed
serializable transaction. The exact token and matching legacy fields are absent;
user, identity, session, and refresh invariants were unchanged. Compromised
material was not restored.

## Assertion-key custody and diagnostic

The stable no-secret Bitwarden inventory name is
`Academy - Identity Client Assertion Private JWK`. Owner inspection found the
item but no private JWK value. The bounded custody search found zero recoverable
private-key candidates and one provider-resident Worker secret binding that is
not exportable through a supported interface. It did not claim exhaustive
absence inside encrypted vault fields. Full receipt:
[`../reviews/academy-identity-client-assertion-custody-recovery-20260903.json`](../reviews/academy-identity-client-assertion-custody-recovery-20260903.json).

The in-place diagnostic at `eb99d9d58f2fe59a0998f2d5dc07842aca0b839d`
was independently reviewed with no critical/high/medium findings. Its controller
tests pass `25/25`. It checks, in order, binding import, exact registered public
fingerprint, local ES256 sign/verify, and Identity assertion admission without
exporting or printing key material.

Operational boundaries:

- exact current-deployment/source/config CAS before upload;
- one candidate-only 32-byte nonce passed through anonymous file descriptor;
- nonce verification before any resident-key access;
- exact `100/0` deployment split and one version-override request;
- serialized signal/failure recovery to current-only traffic;
- fixed secret-free markers, public health recheck, and detached-candidate
  inventory.

The only attempted diagnostic transaction returned its fixed failure marker
before candidate upload because the Cloudflare Access operator session was not
available. Read-only revalidation showed the same production deployment/version,
zero owned diagnostic candidates, and unchanged public health. No Identity
request or key classification occurred. A later single Access login process
expired without producing a token and was not reopened.

## Exact unresolved blocker

Working resident-key status is unknown. The evidence proves neither that the
active binding is valid nor that it is broken. Rotation is therefore not
justified.

When the owner is present, open one bounded Cloudflare Access authentication
flow, complete it promptly, rebaseline the production deployment, and run the
reviewed diagnostic exactly once. Accept only the fixed classification. Apply
and independently review the smallest correction for that stage; rotate only if
the diagnostic proves unavailable, malformed, mismatched, or rejected key
material.

## Remaining playtest

After assertion admission and production health pass, use the already approved
canary for exactly one fresh OTP flow. The owner enters identity and code
privately. Then verify:

1. callback and canonical dashboard/catalog;
2. entitled lesson `setup-and-environment`;
3. session-created progress survives reload;
4. desktop and `412x915` responsive behavior;
5. sign-out;
6. independent cleanup/reset of only progress created by this run.

No prior OTP, confirmation link, callback token, or compromised material may be
used. Until every in-scope checkpoint passes and cleanup is independently
verified, the final playtest result is `BLOCKED`.

## Local verification evidence

- Resident-key diagnostic controller: independent `25/25` PASS, Node syntax,
  TypeScript, Worker-focused, full unit (`2,095/2,095`), workerd signer, Wrangler
  dry-run, and changed-path lint PASS.
- Known unrelated baseline: full lint still reports only the three pre-existing
  `no-require-imports` errors in `academy-bound-worker-executor.cjs`; that file is
  byte-identical to its baseline and was not changed.
- No production deploy, traffic change, Identity request, OTP send, key rotation,
  credential creation, or push is part of this documentation checkpoint.
