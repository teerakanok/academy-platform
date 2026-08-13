# Academy Identity PostgreSQL Session Store - Local Checkpoint - 2026-08-14

**Status:** FINAL DIFFERENT-INDEPENDENT PASS C0/H0/M0/L0

**Authority:**
`reports/reviews/academy-identity-postgres-session-store-freeze-20260814.json`

## Outcome

This checkpoint prepares one production-durable Academy session persistence
boundary while leaving production disabled. `AcademyPostgresIdentitySessionStore`
is structurally compatible with the accepted runtime-completion session port and
adds read, expiry, and idempotent revoke operations for later runtime wiring.

The adapter:

1. accepts only canonical issuer, subject, verified email, activation status,
   and activation revision;
2. generates a 32-byte random opaque ID and retries one database-reported
   collision with a different ID;
3. delegates creation time and expiry to the database clock;
4. accepts a create receipt only when ID, principal, activation, and canonical
   timestamps match exactly;
5. maps unknown and expired reads to absence and makes revoke idempotent; and
6. collapses database, proxy, descriptor, and malformed-result detail to one
   fixed non-enumerable failure.

Migration `0027_identity_session_store.sql` creates only the session ID,
canonical principal, activation, and lifetime columns. RLS is enabled. Direct
table access is revoked from public/browser roles, `service_role`, and
`academy_runtime`; the runtime role receives only create, read, and revoke RPC
execution. Each mutating/read-classification operation is atomic, the live read
locks its row, expiry cleanup is bounded, and collision arbitration anchors TTL
after the insert wins.

## TDD And Verification

| Gate | Result |
|---|---|
| RED | Expected collection failure: `postgres-session-store` did not exist |
| Initial focused GREEN | `1` file / `9` tests PASS |
| Original different review | FAIL `C0/H0/M2/L0` |
| M-01/M-02 RED | `18` tests: `10` pass / `8` fail |
| Remediation focused GREEN | `1` file / `26` tests PASS |
| Remediation relevant regression | `7` files / `112` tests PASS |
| TypeScript | `tsc --noEmit` PASS |
| Scoped ESLint | New source and test PASS |
| Broader Identity sweep | Node 24.18.0 (declared `24.x` engine): `38` files / `534` tests PASS |
| UI and visual | N/A: no route, UI, cookie, or copy changed |
| Database/provider | N/A: injected RPC fakes and static SQL checks only |

The focused suite covers exact create, principal/activation mismatch, active and
expired reads, unknown IDs, repeated revoke, bounded duplicate handling,
database throw/rejection/error, malformed time, surplus input/output, hostile
proxies, receiver binding, secret-detail non-disclosure, and migration policy.

An initial broad run used ambient Node 25.5.0, outside the package's declared
`24.x` engine, and failed the unchanged WebCrypto proxy-forgery test. The same
exact sweep passed `534/534` under installed Node 24.18.0 without a code change;
the supported-runtime result above is the checkpoint evidence.

## Independent Review Remediation

The original different-independent review found two Medium issues:

- **M-01:** session input accepted issuers and raw PostgreSQL subjects outside
  the exact lifecycle principal contract. The adapter now imports the shared
  issuer/subject validators and sends the same lower-case UTF-16 code-unit hex
  `subjectKey` representation used by the lifecycle store. Migration `0027`
  invokes the exact issuer and paired-surrogate/NUL predicates defined by
  migration `0026`. Tests bind the accepted issuer vectors, 1-512 UTF-16 code
  units, paired surrogates, overbound values, NUL, and lone surrogates before
  raw RPC authority.
- **M-02:** PostgreSQL `integer` rejected activation revisions above
  `2147483647` even though the accepted contract permits positive JS safe
  integers. The table, helper, and RPC parameter now use `bigint` with the exact
  `1..9007199254740991` constraint. Tests round-trip `2147483647`, `2147483648`,
  and `9007199254740991`, and reject the next value before RPC.

These changes do not widen the adapter, migration, registry, or production
authority. A different-independent reviewer rebound the refreshed six-file
authority and passed final `C0/H0/M0/L0` after fresh focused `26/26`, expanded
relevant `124/124`, additional durable-store `12/12`, TypeScript, scoped ESLint,
diff, and staged-empty checks.

## Production Boundary

This checkpoint is local and unwired. It does not import a Supabase client,
endpoint, key, registry, route, environment value, or course-entitlement
capability. Migration `0027` has not been applied. No Pool A database, network,
provider, deploy, or production secret was accessed. Registry `enabled`,
`runtimeWired`, and `releaseApproval` remain false, and production remains
NO-GO pending separately authorized migration/runtime evidence.
