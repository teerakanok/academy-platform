# Academy Identity Client-Assertion Web Crypto Signer Local Checkpoint

**Date:** 2026-08-11
**Status:** FINAL INDEPENDENT RIL PASS - C0/H0/M0/L0
**Production:** NO-GO

## Outcome

Academy now has a local server-side signer capability that connects the accepted
client-assertion provider to the standard Web Crypto ECDSA operation. The signer
accepts one already-provisioned opaque `CryptoKey`. Brand-checking native
getters require a private, non-exportable, sign-only key whose Web Crypto
metadata declares P-256 before the capability is exposed.

The returned signer is bound to one client ID, one assertion purpose, and one
key ID. Every call must repeat that exact binding and `ES256` algorithm before
the captured `SubtleCrypto.sign` method receives a bounded, owned byte snapshot.
Web Crypto returns the 64-byte P-256 `r || s` signature shape required by the
Identity Control verifier.

## Ownership Boundary

| Concern | Owner | This checkpoint consumes | This checkpoint does not do |
|---|---|---|---|
| Private-key generation, import, storage, and rotation | Future approved Academy key ceremony and protected runtime | One opaque `CryptoKey` capability | Generate, import, export, serialize, log, or persist key material |
| Key metadata and signing | Academy Web Crypto signer | Native-branded private, non-exportable, sign-only P-256 metadata plus a 64-byte operation result | Trust own-property shadows, duck types, Proxy traps, or non-64-byte signatures |
| Client, purpose, and key binding | Academy signer plus accepted assertion provider | Exact repeated binding on every sign call | Infer a binding from request data or silently serve another purpose |
| Assertion claims and compact JWS | Accepted Academy assertion provider | One 64-byte ES256 signature | Rebuild claims or own replay policy |
| Assertion verification and replay reservation | Identity Control | Producer-compatible signature bytes | Register a public key or reserve a JTI |

This module cannot prove that equivalent private material was imported as a
second `CryptoKey`, or that an operator did not provision the same key under a
different purpose. The reviewed key ceremony, secret-store identity, public-key
digest, and registry record remain authoritative for that isolation. This
checkpoint proves only the metadata and call binding of the opaque capability it
receives.

## Pinned Contracts

Identity Control was inspected at revision
`ad97ba2236bddbc4857d45359bb37b032aebbb05`:

| Path | SHA-256 |
|---|---|
| `reports/change-records/consumer-client-assertion-key-ceremony-20260806.md` | `ad3b1d62596056b90bee14b73caf58372f00e395fd79c3702bc54b5fad5a19ad` |
| `packages/core/src/client-assertion.ts` | `6cc0f77cae9782420883802fc3a92f181773fa22d298ec9b9998dc3718f8fff6` |
| `packages/core/test/client-assertion.test.ts` | `58b67a100de26a7d8ffcbce20e4c021c9b84b3a0c9c4351c4c702121981d8d61` |

The accepted Academy provider at commit
`5b8e2210df8990a3810e4f410aaec1cd46d71e57` was also pinned:

| Path | SHA-256 |
|---|---|
| `academy-web/src/lib/identity/client-assertion-provider.ts` | `9109ca6812c264c43b32411539cf9a749000c746b2b33d9d11d8a55270ad4783` |
| `academy-web/tests/unit/identity-client-assertion-provider.test.ts` | `fbc36a93166c9a70a3f8e7eb06f8faf2e12dd0f1b8583e61cc4ec4ff1042bc3c` |

Runtime compatibility was checked against the current Cloudflare Workers Web
Crypto documentation and W3C Web Cryptography Level 2. Workers lists ECDSA
sign/verify support through `crypto.subtle`, while the standard defines P-256
ECDSA output as fixed-width `r` followed by fixed-width `s`. Node Web Crypto
provided the executable local fixture; Worker TypeScript compilation passed.

## TDD Evidence

1. The first focused run stopped before collection because
   `client-assertion-webcrypto-signer.ts` did not exist.
2. The first implementation returned GREEN 13/13 for provider compatibility,
   key metadata, binding, failure containment, receiver preservation, and the
   forbidden-operation source boundary.
3. Security self-audit added nested metadata and asynchronous byte-snapshot
   coverage. RED passed 14 existing checks and failed one: a stateful
   `namedCurve` getter was read twice and could change from P-384 to P-256.
4. Capturing `namedCurve` once returned GREEN 15/15. The byte-snapshot test also
   proves that caller mutation after invocation cannot change the bytes observed
   by the asynchronous signing operation.
5. The first all-config TypeScript gate found that the internal snapshot return
   type had widened back to `Uint8Array<ArrayBufferLike>`. Narrowing the already
   owned copy to `Uint8Array<ArrayBuffer>` made the Worker-facing `BufferSource`
   contract explicit without changing runtime behavior.
6. The first different independent RIL returned `C0/H0/M1/L0`. Ordinary key
   property reads trusted own-property shadows, so a genuine extractable key
   with an own `extractable=false` property passed the factory and signed.
7. Remediation RED passed 15 existing checks and failed three brand cases:
   shadowed extractable key, duck-typed object, and Proxy-wrapped key. Captured
   `CryptoKey.prototype` getter intrinsics now enforce the native brand and
   scalar metadata; GREEN passes 18/18.
8. A different independent closure RIL bound the remediated five-file manifest
   and returned final `C0/H0/M0/L0`. On the supported Node 24 runtime, focused
   verification passed 18/18 and the native getters rejected the Proxy fixture.
   A separate Node 25 observation safely unwrapped a Proxy around a valid key
   while still returning the real `extractable` value, so no metadata bypass was
   present. Runtime wiring must repeat this probe against its pinned `workerd`
   compatibility date rather than rely on literal cross-runtime Proxy behavior.

Coverage also proves rejection of extractable, public, and P-384 keys; exact
method capture and receiver preservation; fixed detail-free failures; bounded
1..4096-byte signing input; native brand-checked key metadata; descriptor-only
runtime input reads; no key exposure on the returned signer; and a real provider
assertion verified with the matching public key.

## Current Verification

| Gate | Result |
|---|---|
| Focused Web Crypto signer suite | PASS - 18/18 |
| Provider + JTI + signer focus | PASS - 59/59 |
| Academy Identity regression | PASS - 19 files / 287 tests |
| Full Academy unit suite | PASS - 91 files / 977 tests |
| Identity Control assertion + lifecycle contract | PASS - 22/22 |
| Full Academy lint and all TypeScript configurations | PASS - one pre-existing generated-registry warning, zero errors |
| Independent C/H/M/L review | PASS - original C0/H0/M1/L0 remediated; different closure RIL C0/H0/M0/L0 |

UI, visual, browser, database, migration, and build lanes are N/A. This
checkpoint adds one pure server-side module and unit test, has no production
import, and changes no rendered or durable state.

## Production Boundary

This checkpoint creates no key, credential, secret-store object, public JWK,
registry row, endpoint, runtime binding, deployment, or traffic. The future key
loader must operate inside an approved Academy secret boundary and the key
ceremony must bind the resulting public digest to this client, purpose, and key
ID before this signer can be composed into runtime.

Exact lifecycle values, public-key registration and rotation, authenticated
HTTP, scheduler ownership, named operators, deployment evidence, and explicit
release authorization remain external gates. `enabled=false`,
`releaseApproval=false`, `runtimeWired=false`, and production NO-GO remain
unchanged. This checkpoint adds zero production-readiness percentage points by
itself.

## Frozen Scope

The checkpoint manifest will bind these five content paths:

1. `academy-web/src/lib/identity/client-assertion-webcrypto-signer.ts`
2. `academy-web/tests/unit/identity-client-assertion-webcrypto-signer.test.ts`
3. `reports/reviews/academy-identity-client-assertion-webcrypto-signer-local-checkpoint-2026-08-11.md`
4. `plans/active_plan.md`
5. `plans/completed_log.md`

The generated manifest is outside its own file list. No registry, route,
Worker, Wrangler, database, secret, credential, key-generation, key-import,
deployment, or production file is in scope.
