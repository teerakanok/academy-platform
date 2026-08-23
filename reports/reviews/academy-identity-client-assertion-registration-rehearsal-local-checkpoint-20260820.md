# Academy Identity Client-Assertion Registration Rehearsal

**Date:** 2026-08-20

**Classification:** local-only, production-disabled author checkpoint

**Academy baseline:** `77ec9b572a10e12906139e5ba7c24b04d3dfb4d2`

**Identity Control baseline:** `f0e1cc5dd89271ca2a1a78fd4b3c7b825bf61c1e`

## Outcome

Academy's client-assertion rehearsal now executes Identity Control's committed
`ClientControlRegistry` through the required sequence:

1. old key `active`
2. old key `overlap` plus new key `active`
3. old key `retired` plus new key `active`

Every run creates three ephemeral P-256 key pairs in memory. Key IDs are the `academy-` prefix plus
the first 160 bits of the canonical public-JWK SHA-256 digest; no key ID is hardcoded. Only public
material reaches the registry, authenticator, returned result, runtime fixture, or freeze fixture.

The strict fixture validator binds the exact committed producer shape: client and service,
audience, revision, public-key reference, millisecond `activatedAt`, bootstrap digest, active and
overlap key lists, and runtime public-key map. Identity's f0e1cc5 bootstrap accepts the exact public
JWK fields `crv,key_ops,kty,use,x,y`; `algorithm: ES256` is the sibling registration field. The
rehearsal follows that producer contract. It intentionally holds bootstrap `enabled=false`, which
is the one difference from a deployable producer input and keeps the fixture outside the live
bootstrap shell path.

The existing Academy provider/signer and Identity authenticator prove active and overlap acceptance.
They refuse retired and unknown keys, tampered signatures, wrong client or audience, and public-key
material mismatch. Validator negatives also cover a bad reference, imprecise activation time,
private `d`, runtime material mismatch, illegal transition order, and a snapshot with no active key.
`enabled`, `runtimeWired`, `releaseApproval`, and `productionEvidence` remain false.

## Conformance Ledger

This slice reuses the existing 23-scenario consumer-conformance generator and does not create a
second ledger. The generator declaration now names the current ten-file checkpoint. Its focused
test first proves the 2026-08-14 declaration fails byte verification, then proves this refreshed
manifest passes. Scenario counts remain 16 local pass and 7 `not_proven`; this is stronger local
evidence for the existing `exchange.client-assertion` scenario, not production evidence.

The three canonical conformance JSON files were not regenerated. Their canonical receipt collector
enumerates the full Academy worktree, which would read the protected dirty vault file owned by
another session. Once that file is clear, the normal generator `--write` followed by `current` is
the remaining deterministic intake step.

## Model Route

The narrowed remediation was routed through the required sensitive-source projection before Sol
coding began.

- work-order manifest SHA-256:
  `a5049a8cbdb45edb303effb5e86cbd10b8c5c535c69a9f35957d850738c4ac4b`
- result directory: `/tmp/academy-identity-remediation-glm-20260820-r1`
- status file: `/tmp/academy-identity-remediation-glm-20260820-r1/status.json`
- observed phases: `projection_validated`, `worker_started`, `preflight_complete`,
  `provider_started`, `input_closed`, `first_activity`
- terminal result after the approved 900-second bound: `E_TIMEOUT`, surfaced by the controller as
  `E_CHILD`

The worker returned no receipt or patch and did not edit the source tree. This recorded route
unavailability justified the Sol fallback. Route scratch files are removed during checkpoint
cleanup.

## TDD Evidence

RED:

```text
registration rehearsal: 7 failed / 1 passed
missing executable sequence, strict public JWK, derived IDs, and negative validation

conformance generator: 2 failed / 6 passed
stale declaration selected and current checkpoint digest mismatch
```

GREEN:

```text
vitest focused identity registration/conformance/policy: 3 files, 14 tests passed
node conformance generator test: 8 tests passed
tsc --noEmit: pass
scoped eslint: pass
checkpoint freeze verify: 10 files verified
git diff --check: pass
```

## Scope

The frozen checkpoint covers the generator and tests, rehearsal module and tests, existing consumer
policy evidence, active-plan entry, canonical conformance report byte state, and this report. It
does not add a route, endpoint, environment variable, real key, credential, registry production
value, database change, deployment step, or production approval.

## Remaining Gates

Production readiness still requires real key custody and registration, a timed rotation against a
released Identity runtime, clean-worktree canonical intake, independent checkpoint approval, named
operators and kill-switch ownership, and separate release authorization.

Freeze:
`reports/reviews/academy-identity-client-assertion-registration-rehearsal-freeze-20260820.json`.

## Independent Review

The first strict read-only defensive review returned `C0/H0/M1/L0`. M-01 found that the active plan
grouped `timestamp` with authenticator assertion refusals even though this checkpoint tests
millisecond `activatedAt` precision in the registration-sequence validator, not expired or
not-yet-valid assertions. The finding is in-bound because it overstates the frozen evidence claim.

The plan now separates authenticator checks (retired, unknown, tampered, wrong client, wrong
audience, and key-material mismatch) from validator checks (reference, activation-time precision,
private material, and transition order). The implementation and tests are unchanged. A fresh freeze
and closure review must pass before this checkpoint is accepted.
