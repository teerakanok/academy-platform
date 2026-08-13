# Academy Identity Signed-Result Runtime Composition - Local Checkpoint

**Date:** 2026-08-14
**Status:** DIFFERENT-INDEPENDENT PASS - C0/H0/M0/L0
**Production enabled:** FALSE
**Runtime wired:** FALSE
**Release approval:** FALSE

## Purpose

Compose the accepted Identity Control signed code-exchange result verifier into Academy's existing
callback transaction, runtime-completion, and browser-flow modules without adding endpoint, key,
audience, registry, route, environment, database, migration, Cloudflare, deploy, or UI authority.
The producer contract and positive/rotation vectors are bound to Identity Control revision
`5cf3d58e7e0a1dc3fe355de19f6b44a8a1742171`.

## Boundary

- The new least-capability port owns strict active/overlap/retired result-key projection and calls
  the accepted Academy-local ES256 envelope verifier with exact issuer, audience, client, nonce,
  principal issuer, service, time, lifetime, and `kid` bindings.
- Production composition calls `completeSignedIdentityCallback`; it requires the injected verifier
  and has no unsigned result fallback. A rejected verifier result stops before profile activation or
  session creation, while the already-consumed callback remains one-time.
- The existing local-fixture callback stays on its separate raw-result function for local developer
  behavior. Registry and routes do not import or construct the signed production composition.
- Disabled admission rejects before reading any downstream capability. Active/overlap vectors pass;
  retired, unknown-key, tampered, unsigned, binding, service, principal, and time mismatches fail on
  one fixed non-enumerable verifier error surface.

## TDD And Verification

- RED: focused collection stopped because `code-exchange-result-verifier-port.ts` did not exist.
- Interim test repair: verifier behavior passed `2/2`, while the test process exposed unhandled
  rejected-promise reuse; the fixture now invokes each rejection once.
- Integration RED on resume: `53/60` passed; seven direct transaction tests did not yet reflect the
  required injected verifier boundary. The final split preserves the explicit dev-local raw seam and
  gives production composition a separately named mandatory signed seam.
- GREEN on Node `24.18.0`: focused composition passes `4` files / `45` tests.
- Related Academy Identity regression on Node `24.18.0`: `38` files / `558` tests pass.
- Node `24.18.0` TypeScript and scoped ESLint pass with no findings.
- `git diff --check` and staged-empty checks pass at freeze.

## Readiness

This is local composition evidence only. Conformance remains `16` pass / `7` `not_proven`;
`enabled=false`, `runtimeWired=false`, `releaseApproval=false`, and production remains `NO-GO`.
Visual review and database rehearsal are N/A because no UI, route behavior, registry value,
migration, or database changed.

## Different-Independent Review

A different-independent reviewer bound the canonical 11-file freeze, traced the verifier from the
browser flow through runtime completion and the signed transaction seam, and compared the wire,
binding, key-lifecycle, and result contracts with Identity Control revision
`5cf3d58e7e0a1dc3fe355de19f6b44a8a1742171`. The reviewer confirmed that all three Academy signed
vectors byte-match the producer fixtures, disabled admission reads no downstream capability, and
the registry and production routes remain fail-closed.

Fresh verification on the declared Node `24.18.0` engine passed focused `45/45`, Academy Identity
`558/558`, TypeScript, scoped ESLint, and diff hygiene. Final verdict: `C0/H0/M0/L0`. Conformance
remains `16/23`; all enablement, runtime, production-evidence, and release flags remain false, and
production remains `NO-GO`.
