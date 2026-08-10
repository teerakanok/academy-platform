# Academy Identity Client-Assertion JTI Source Local Checkpoint

**Date:** 2026-08-11
**Status:** FINAL INDEPENDENT RIL PASS - C0/H0/M0/L0
**Production:** NO-GO

## Outcome

Academy now has a local server-side JTI source for client assertions. Its public
factory takes no input and uses only the runtime Web Crypto
`globalThis.crypto.randomUUID()` method. Each call returns one canonical,
lowercase UUID v4 that already fits the Identity Control JTI grammar.

The factory captures the Web Crypto object and `randomUUID` method once, then
preserves the original receiver. Missing crypto support, a missing or throwing
method, and malformed output all collapse to one fixed detail-free failure. The
module does not expose an entropy override, load a secret, keep mutable request
state, or provide a weak-random fallback.

## Ownership Boundary

| Concern | Owner | This checkpoint consumes | This checkpoint does not do |
|---|---|---|---|
| UUID v4 entropy and formatting | Web Crypto runtime | `crypto.randomUUID()` | Accept caller-supplied entropy or use `Math.random()` |
| JTI placement in the assertion | Academy assertion provider | One canonical UUID v4 per call | Build or sign the rest of the assertion |
| One-time replay reservation | Identity Control | Exact JTI grammar and producer replay contract | Store replay state or claim collision-free certainty |
| Runtime composition | Future reviewed Academy runtime entry point | Nothing in this checkpoint | Wire registry values, keys, HTTP, scheduler, or traffic |

UUID v4 collision resistance is probabilistic, not a durable uniqueness
transaction. Identity Control remains authoritative for hashing and atomically
reserving each JTI until assertion expiry. A duplicate is rejected by that
producer boundary.

## Pinned Contracts

Identity Control was inspected at revision
`ad97ba2236bddbc4857d45359bb37b032aebbb05`:

| Path | SHA-256 |
|---|---|
| `packages/core/src/client-assertion.ts` | `6cc0f77cae9782420883802fc3a92f181773fa22d298ec9b9998dc3718f8fff6` |
| `packages/core/test/client-assertion.test.ts` | `58b67a100de26a7d8ffcbce20e4c021c9b84b3a0c9c4351c4c702121981d8d61` |
| `docs/integration/consumer-registry-v1.md` | `d880b0e2a8000f6898b76b91ee47ab18b886ac8e2f413f214448a8a2bed575a4` |

The producer accepts a URL-safe JTI of 16-160 characters, includes the JTI in a
client-scoped replay digest, and reserves the digest only after the assertion's
shape, claims, key, time window, and signature pass.

Runtime compatibility was checked against the current Cloudflare Workers Web
Crypto reference, which lists `crypto.randomUUID()` as an RFC 4122 version 4
UUID generated from a cryptographically secure random source. The latest
retrieved `@cloudflare/workers-types` package was `5.20260810.1`; its `Crypto`
interface declares `randomUUID(): string`. Node 24.18.0 exercised the same
zero-argument API in the focused and full test runs.

## TDD Evidence

1. The first focused run stopped before collection because
   `client-assertion-jti-source.ts` did not exist.
2. The first implementation passed 9/10. Explicit `null` configuration was
   incorrectly treated like an omitted source and fell back to global crypto.
3. Separating omitted input from malformed input returned GREEN 10/10.
4. Security self-audit then produced RED 10/11: the public factory still had one
   argument and therefore allowed a caller-supplied UUID source whose entropy
   quality could not be proven.
5. The production API became zero-argument and global-Web-Crypto-only. Tests
   now stub the global only inside the test process; focused is GREEN 11/11.

Coverage proves canonical UUID v4 output, 32 distinct default-runtime samples,
method capture and receiver preservation, malformed output without coercion,
missing/accessor/runtime failures with no detail leak, and an exact JTI flowing
through the real assertion provider. Static coverage rejects weak randomness,
environment reads, network calls, logging, and runtime wiring.

## Current Verification

| Gate | Result |
|---|---|
| Focused JTI source suite | PASS - 11/11 |
| Academy Identity regression | PASS - 18 files / 269 tests |
| Full Academy unit + type projects | PASS - 91 files / 963 tests |
| Identity Control assertion + lifecycle contract | PASS - 22/22 |
| Full Academy lint and all TypeScript configurations | PASS - one pre-existing generated-registry warning, zero errors |
| Independent C/H/M/L review | PASS - C0/H0/M0/L0; manifest verified before and after review |

UI, visual, browser, database, migration, and build lanes are N/A. This
checkpoint adds one pure server-side module and unit test, has no production
import, and changes no rendered or durable state.

The different independent reviewer confirmed the zero-argument Web Crypto-only
boundary, exact method capture and receiver preservation, canonical UUID v4
validation, fixed failure surface, producer seam, and absence of production
wiring. No code, security, debt, or reader-facing finding remained.

## Production Boundary

This checkpoint does not select a client, purpose, audience, key ID, lifetime,
clock, private key, signer, endpoint, retry policy, or schedule. It does not
change the disabled registry or connect the assertion provider to a runtime
entry point.

Key ceremony, protected signer composition, exact lifecycle values, HTTP and
scheduler ownership, named operators, deployment evidence, and explicit release
authorization remain external gates. `enabled=false`, `releaseApproval=false`,
`runtimeWired=false`, and production NO-GO remain unchanged. This checkpoint
adds zero production-readiness percentage points by itself.

## Frozen Scope

The checkpoint manifest will bind these five content paths:

1. `academy-web/src/lib/identity/client-assertion-jti-source.ts`
2. `academy-web/tests/unit/identity-client-assertion-jti-source.test.ts`
3. `reports/reviews/academy-identity-client-assertion-jti-source-local-checkpoint-2026-08-11.md`
4. `plans/active_plan.md`
5. `plans/completed_log.md`

The generated manifest is outside its own file list. No registry, route,
Worker, Wrangler, database, secret, credential, key, or deployment file is in
scope.
