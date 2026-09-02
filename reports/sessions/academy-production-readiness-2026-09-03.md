# Academy Production Readiness Checkpoint

Status date: `2026-09-03`

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
