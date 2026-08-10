# Academy Identity Client-Assertion Provider Local Checkpoint

**Date:** 2026-08-11
**Status:** FINAL INDEPENDENT RIL PASS — `C0/H0/M0/L0`
**Production:** NO-GO

## Outcome

Academy now has a local server-side provider that constructs the exact ES256
client assertion accepted by Identity Control. It does not generate, import,
export, read, or store a private key. Instead, it calls one injected signer port
with bounded signing bytes and accepts only one raw 64-byte P-1363 signature.

Each provider instance pins all four authority-bearing values before it can be
used:

- one Academy client ID;
- one exact HTTPS audience;
- one key ID; and
- one purpose, either `code_exchange` or `lifecycle_pull`.

The provider also requires the injected signer capability to declare the same
client ID, purpose, and key ID before clock, JTI, or signing work. It passes that
same binding into every signing call so the future runtime signer can enforce
the key mapping again. A code-exchange provider accepts only `{ audience }`; a
lifecycle provider accepts only `{ consumerId, audience }` and requires the
consumer ID to equal the configured client ID.

## Ownership Boundary

| Concern | Owner | This checkpoint consumes | This checkpoint does not do |
|---|---|---|---|
| Assertion verification, replay reservation, active/overlap keys and client enablement | Identity Control | Exact verifier and registry contracts | Reimplement replay storage or registry policy |
| Assertion construction | Academy provider | Client, audience, key ID, lifetime, clock, JTI source and signer port | Select production values or read secrets |
| Private signing material and key-to-purpose isolation | Future Academy runtime signer boundary and reviewed key ceremony | Bound client, purpose, key ID and raw signing input | Export private material or accept a mismatched capability |
| Lifecycle HTTP and scheduling | Future reviewed runtime adapters | Nothing in this checkpoint | Fetch, choose endpoint/status/deadline/backoff or add a schedule |

The producer contract requires one key per client and purpose. This module now
rejects a signer capability whose declared client, purpose, or key ID differs
from the provider and passes the frozen binding into `sign`. The future runtime
signer and reviewed key ceremony remain responsible for proving that the
underlying private key itself is not mapped to another binding. Identity Control
receives only the separately reviewed public JWK and key reference during that
future ceremony; this module never receives those registry writes.

## Pinned Producer Contract

Identity Control was inspected at revision
`ad97ba2236bddbc4857d45359bb37b032aebbb05`. The relevant bytes were:

| Path | SHA-256 |
|---|---|
| `packages/core/src/client-assertion.ts` | `6cc0f77cae9782420883802fc3a92f181773fa22d298ec9b9998dc3718f8fff6` |
| `packages/contracts/src/index.ts` | `74103c92a46b87831e173ff433600271ddac4238b6ad2518203ee10ca726e6d6` |
| `docs/integration/consumer-registry-v1.md` | `d880b0e2a8000f6898b76b91ee47ab18b886ac8e2f413f214448a8a2bed575a4` |
| `reports/change-records/consumer-client-assertion-key-ceremony-20260806.md` | `ad3b1d62596056b90bee14b73caf58372f00e395fd79c3702bc54b5fad5a19ad` |
| `config/consumer-registry-v1.approved.json` | `572d230a9f84c219e5b82eeb84dd1350bd8a319e180f2208f45db3abc03d1875` |

The provider emits only:

- header keys `alg`, `kid`, `typ`, with `ES256` and `JWT` fixed;
- claim keys `aud`, `exp`, `iat`, `iss`, `jti`, `sub`;
- `iss=sub=configured client ID`;
- a configured exact audience;
- an injected URL-safe JTI of 16–160 characters;
- a configured lifetime of 30–300 seconds; and
- a canonical three-segment base64url compact JWS with a 64-byte signature.

Header and claim bytes remain within the producer parser's 512-byte and
2,048-byte limits. Audience input is capped before URL parsing or JSON
allocation. Signature length is checked with the typed-array intrinsic before a
fixed 64-byte copy, so an overbound signer result cannot trigger a proportional
clone.

## TDD Evidence

1. The first focused run stopped before collection because
   `client-assertion-provider.ts` did not exist.
2. The first implementation passed focused 20/20.
3. Resource-bound tests then produced RED at 20/22: an overbound audience was
   accepted, and an overbound typed-array subclass reached its allocation path
   before rejection.
4. The provider added producer-aligned byte ceilings and pre-copy signature
   validation; focused returned GREEN 22/22.
5. Purpose-isolation tests then produced RED at 22/25: invalid purpose was not
   read, and a provider could be used across both protocols.
6. The provider pinned `code_exchange | lifecycle_pull` and validated the exact
   request shape before clock, JTI, or signer work; focused was GREEN 25/25.
7. The first different independent RIL returned `C0/H0/M1/L0`: the signer port
   carried only algorithm and signing bytes, so one signer/key capability could
   be reused across client or purpose boundaries while the report claimed
   isolation.
8. Test-only remediation RED passed 25 existing checks and failed the three new
   client, purpose, and key-binding cases. The provider now validates the signer
   binding before side effects and sends the same binding to `sign`. Focused is
   GREEN 30/30, including exact shared-capability rejection and one-read binding
   snapshots.

The positive test uses an ephemeral, non-exportable P-256 fixture key only
inside Node 24 test memory. It verifies the produced signature with WebCrypto,
checks every exact header and claim, proves distinct JTI-source calls, and sends
the lifecycle provider through the real Academy pull-request builder. The
production module contains no key generation or key import.

Negative coverage includes invalid configuration, wrong client/audience,
cross-purpose calls, a signer capability bound to another client/purpose/key,
extra/accessor/Proxy request fields, invalid clock or JTI, signer rejection,
malformed signature length, overbound allocation, original receiver
preservation, one-read option and signer-binding snapshots, and fixed
detail-free failure surfaces.

## Current Verification

| Gate | Result |
|---|---|
| Focused provider suite | PASS — 30/30 |
| Identity regression | PASS — 17 files / 258 tests |
| Full Academy unit + type projects | PASS — 90 files / 952 tests |
| Identity Control verifier + lifecycle contract | PASS — 22/22 |
| Full Academy lint and all TypeScript configurations | PASS — one pre-existing generated-registry warning, zero errors |
| First independent C/H/M/L review | FAIL — `C0/H0/M1/L0`; signer binding absent |
| Different independent remediation review | PASS — `C0/H0/M0/L0`; frozen binding and ownership wording verified |

UI, visual, browser, database and migration lanes are N/A because this checkpoint
adds one pure server-side library and its unit tests only.

## Production Boundary

This checkpoint does not provide or authorize a private key. It does not change
the disabled registry, generate a JTI source, choose the unresolved lifecycle
audience, bind a secret store, add an HTTP endpoint, schedule a puller, deploy,
or send traffic. The lifecycle test audience uses the reserved `.example`
domain and is fixture-only.

The existing code-exchange audience is owner-approved in the non-secret
registry, but its real private-key provisioning, public-key registration,
rotation rehearsal and deployment remain separately authorized operations.
Lifecycle publication additionally still requires its exact endpoint,
client-assertion audience, event audience, issuer/key set, lifetime/skew policy,
named kill-switch operators, retry/lag ownership, deployment evidence and
production authorization.

`enabled=false`, `releaseApproval=false`, `runtimeWired=false` and production
NO-GO remain unchanged. This checkpoint increases local implementation coverage;
it adds zero production-readiness percentage points by itself.

## Frozen Scope

The checkpoint manifest will bind these five content paths:

1. `academy-web/src/lib/identity/client-assertion-provider.ts`
2. `academy-web/tests/unit/identity-client-assertion-provider.test.ts`
3. `reports/reviews/academy-identity-client-assertion-provider-local-checkpoint-2026-08-11.md`
4. `plans/active_plan.md`
5. `plans/completed_log.md`

The generated manifest is outside its own file list and remains the reviewer
authority. No runtime, registry, route, Worker, Wrangler, database, secret,
credential or deployment file is in scope.
