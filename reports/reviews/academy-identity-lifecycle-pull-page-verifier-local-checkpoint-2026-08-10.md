# Academy Identity Lifecycle Pull-Page Verifier

**Date:** 2026-08-10
**Status:** FINAL INDEPENDENT RIL PASS `C0/H0/M0/L0`; production NO-GO
**Academy source:** `845e371173efb7b15b7605ecbc9496c47e2068fb`
**Identity Control source:** `a6ef1f430e1939a76fdccdcc35a1da41ff7a4606`

## Outcome

Academy now has a pure local boundary that turns one duplicate-safe parsed
Identity Control lifecycle pull response into a verified page for the accepted
page-store and pull-cycle modules. It validates the producer's exact page shape,
request limit, cursor relationship, configuration revision, and compact-JWS
bounds before verifying every envelope with the existing WebCrypto boundary.

The verifier returns a fresh ordered page only after every envelope succeeds.
One malformed page field, cursor relation, policy input, or envelope makes the
whole page unavailable, with no partial event result or log output.

## Source-Bound Contract

The implementation mirrors the executable producer contract at Identity
Control revision `a6ef1f430e1939a76fdccdcc35a1da41ff7a4606`:

- response keys are exactly `envelopes`, `nextCursor`, and `configRevision`;
- `envelopes` is a dense plain array with at most 100 compact JWS values and no
  more entries than the requested limit;
- cursor strings are canonical unsigned decimals within signed PostgreSQL
  bigint range;
- an empty page echoes the supplied cursor, while an initial empty page keeps a
  null cursor;
- a nonempty page advances by exactly the number of envelopes, with overflow
  rejected;
- `configRevision` is a positive safe integer.

Input objects, cursor objects, arrays, policy objects, key objects, and public
JWKs are read through exact own data descriptors. Accessors, symbols,
non-enumerable fields, sparse arrays, surplus fields, invalid prototypes, and
throwing descriptor traps fail closed. Descriptor values are captured once;
ordinary property `get` traps are never invoked.

The verification time is validated once through the Date intrinsic and cloned.
The explicit issuer, audience, skew, lifetime, key ID, ES256 algorithm, and
public JWK policy is likewise projected once into a fresh internal value. Every
envelope receives that same time and policy snapshot.

## TDD And Verification

The test-only RED run stopped before collection because
`@/lib/identity/lifecycle-pull-page-verifier` did not exist. The first GREEN run
passed all 34 focused assertions. A project-target typecheck then found one
bigint-literal compatibility error; replacing the literal with the existing
`BigInt(string)` project pattern restored focused and typecheck GREEN without a
behavioral change.

## Independent RIL M-01 And Remediation

The first independent RIL returned `C0/H0/M1/L0`. M-01 found that the dense
array snapshot enumerated `Reflect.ownKeys` before checking the own `length`
descriptor against its maximum. An already overbound Array Proxy could therefore
run an attacker-controlled enumeration trap even though the page or JWK was
destined for rejection.

The remediation added separate overbound proxies for a 101-envelope page and a
two-entry JWK `key_ops` array. Test-only RED returned 34 passes and 2 failures;
each `ownKeys` trap ran once. `snapshotDenseArray` now reads and validates the
own length data descriptor first, rejecting missing, accessor, unsafe, negative,
or overbound lengths before enumeration. GREEN passes all 36 focused assertions,
the 122-test lifecycle regression, the 14-test producer contract, and full
lint/TypeScript checks. Both adversarial traps remain at zero calls.

| Gate | Result |
| --- | --- |
| M-01 test-only RED | EXPECTED FAIL, 34 pass / 2 fail; both traps called once |
| Focused pull-page verifier after remediation | PASS, 36/36; both traps called zero times |
| Relevant lifecycle regression | PASS, 6 files / 122 tests |
| Full Academy unit regression | PASS, 82 files / 814 tests |
| Identity Control lifecycle pull contract | PASS, 14/14 |
| Different independent final re-review | PASS `C0/H0/M0/L0` |
| Scoped ESLint | PASS |
| Full lint and TypeScript checks | PASS; one pre-existing generated-registry warning |
| Tracked/new-file whitespace checks | PASS |
| Runtime import-disconnection assertion | PASS |

Next/OpenNext build is not an applicable behavior gate for this checkpoint: the
new module is intentionally absent from runtime imports, while full project
TypeScript checks compile it directly. Visual review is also N/A because the
checkpoint changes no UI, copy, layout, route, or runtime state. Database tests
are N/A because the boundary has no database dependency or migration.

## Runtime Boundary

The test reads the current Worker, Wrangler configuration, OpenNext
configuration, middleware, Identity registry, and auth callback entrypoint and
proves that none imports this verifier. The source also has no network API or
HTTP response dependency. A future authorized transport adapter will handle
authenticated requests, bounded duplicate-safe JSON parsing, endpoint selection,
client assertions, network deadlines, and retry behavior.

The following production inputs remain external gates: publisher endpoint,
issuer/audience/key distribution, client-assertion credentials, skew and
lifetime policy, scheduler and Worker bindings, retry/lag policy, operational
owner, deployed evidence, registry enablement, release approval, and production
authorization. Current values remain `enabled=false`, `releaseApproval=false`,
and `runtimeWired=false`.

## Freeze And Review

The machine freeze manifest covers the source, focused test, this report, and
the two narrow plan files. The manifest stays outside its own file list:

`reports/reviews/academy-identity-lifecycle-pull-page-verifier-freeze-20260810.json`

A different independent final re-review closed M-01 and passed the checkpoint
at `C0/H0/M0/L0`. Local verification does not authorize runtime wiring,
Identity Control traffic, deployment, or production release.
