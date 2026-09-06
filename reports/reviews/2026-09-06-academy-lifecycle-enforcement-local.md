# Academy lifecycle enforcement — local candidate

Implemented the signed pull composition, Cloudflare schedule, durable projection
effects, indexed principal revocation, callback/session erasure fencing,
stale-email guard, and find-only request resolver. An enabled runtime now exposes
sanitized initialization failures. An unapproved producer config revision
withholds active grants while applying disabled/deleted revocations immediately.
Migration `0032` blocks its unsafe automated downgrade before mutation. No live
database was touched.

The first correction review then found three remaining gaps. Callback
activation did not read checkpoint config health, no explicit durable revision
recovery existed, and session cleanup ran before the principal lock. The second
RED/GREEN cycle closes all three while preserving fresh bootstrap and immediate
revocation behavior.

Independent R2 review returned `PASS` for this local candidate. The review was
limited to the frozen source and local evidence; it does not prove production
migration, deployment, producer provisioning, or a live end-to-end lifecycle
flow. Review source SHA-256:
`e41382d32da2f42debb1842b5318c057b0e61156f0103b6c353aeff90d5601fe`;
result file SHA-256:
`e21b1cb8a0df346f7ac89d040e404e8006405dccaee2a223e5337b2a6c3a18df`.
The 26-path repository freeze manifest is
`/private/tmp/cyberskills-prod-cde63a58/academy-native-r2-freeze-sha256.log`
(SHA-256
`f71e69173771c0edd07c2cae00797dee95be571e60ab72f5faad6f6838c28aa8`);
all 24 non-report paths still matched it byte-for-byte before this report and
the security checklist were updated.

## Commands

- Focused unit RED — exit `1`, `5/7` passed: enabled initialization returned
  `null` and rollback lacked a fail-closed guard. Raw evidence:
  `/private/tmp/cyberskills-prod-cde63a58/academy-native-red-unit-raw.log`.
- Owned PostgreSQL RED — exit `1`, `32/34` passed: an active effect applied
  under config revision mismatch and a session was inserted during a deletion
  transaction. Evidence: `academy-native-red-postgres.log`.
- Second focused unit RED — exit `1`, `32/34` passed: the page store lacked the
  approved-revision RPC and runtime claimed the lease without reconciliation.
  Evidence: `academy-native-r2-red-unit.log`.
- Second owned PostgreSQL RED — exit `1`, `35/38` passed: mismatch callback
  bypass, missing revision approval, and reverse cleanup/revoke lock order were
  reproduced. Evidence: `academy-native-r2-red-postgres.log`.
- `cd academy-web && npx vitest run --project unit` — exit `0`, `145` files /
  `2403` tests. Final evidence: `academy-native-r2-gate-unit.log`.
- Exact acceptance `npm ci --ignore-scripts --no-audit && npx vitest run
  --project unit` — exit `0`, `2403/2403`; npm warned that the runner was Node
  `25.5.0` while the package declares `24.x`. Evidence:
  `academy-native-r2-gate-acceptance.log`.
- `node scripts/test-identity-lifecycle-page-store-postgres.mjs` — exit `0`,
  final pinned arm64 PostgreSQL fixture `38/38`, including callback config-health,
  observed-successor approval, role isolation, lock order, and rollback;
  forward bootstrap ran under `ROLLBACK` before `COMMIT`, then cleanup was
  verified. Evidence: `academy-native-r2-green-postgres.log`.
- `npm run lint` — exit `1` only for the three known baseline
  `academy-bound-worker-executor.cjs` `no-require-imports` errors; 16 baseline
  warnings. ESLint stops before typecheck in this script.
- `npx tsc --noEmit` — exit `0`.
- `npx tsc -p tsconfig.worker.json` — exit `0`.
- `npx tsc -p ops/academy-retention-worker/tsconfig.json` — exit `0`.
- `npm run build:cf` — exit `0`; workerd `11/11`, Next static generation
  `65/65`, and OpenNext bundle complete. Final evidence:
  `academy-native-r2-gate-build-cf.log`.

## Remaining seams

- LOW defense-in-depth residual from independent review: lifecycle and session
  guards accept any structurally canonical issuer. Pinning the documented exact
  principal issuer in durable state would further constrain accepted identities.
- Obtain and provision the already-approved exact private endpoint, assertion
  audience, event audience, producer key set, and Academy lifecycle private key;
  the registry snapshot intentionally leaves them null.
- Apply migration `0032` only through a separately reviewed Pool A
  dry-run/backup/forward-recovery path; its automated rollback deliberately
  aborts because the previous definition can resurrect erased profiles. No live
  execution is covered here.
- Reconciliation after a producer config revision change still requires the
  producer-contract review and source update of the pinned Academy policy
  revision before the dedicated RPC can apply withheld active effects; the RPC
  rejects arbitrary resets and revisions not previously observed.
- Migration `0031` detached entitlement audit retention remains age-based. A
  production legal hold still requires documented external authority; this
  correction adds no new retention permission or policy.
