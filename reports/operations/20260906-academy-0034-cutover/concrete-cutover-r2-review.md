# Academy concrete cutover R2 independent review — PASS

Reviewed read-only on 2026-09-07. No production command, deploy, database
connection, or product-source mutation was performed by this reviewer.

## Decision

PASS for the R1 backup-binding defect. The reviewed packet now rejects a
same-schema archive from a different cutover/window before psql COMMIT, while
accepting a fresh receipt bound to the current cutover and maintenance window.

## Exact reviewed inputs

| Artifact | SHA-256 |
| --- | --- |
| Concrete plan | `16ae21d9b5ffc315120cb848427f01484fb7d392fb1ed30e44bb9bdab4d005ef` |
| Host commit R2 | `0a0cb0ed12561b4db0a4bf7dbfd244c39eb50d2612abcabfd184ef0110658784` |
| Backup host R2 | `ce7245a3fd5ce7668f5a88f67a63da9c23e9dad29983161d7550d1e954b73b9c` |
| Exact migration 0034 | `6355c54a468884008373876565443a6a5456e4005c2026377f46a8a449be66f0` |
| Reviewed wrapper R2 | `11f942279ea4012566e9f49b5563b7b3d33c73ea89f30cff96d50a5928a96e4f` |

## Evidence and findings

- Commit validates a root-owned, regular, single-link, `0600` archive and its
  sibling protected receipt before invoking COMMIT.
- Receipt binds archive path/SHA, expected normalized pre-backup Academy schema
  hash, `cutover_id`, maintenance start timestamp, and post-maintenance backup
  start timestamp. Archive list success is also required.
- Backup host snapshots and compares the expected baseline before `pg_dump`,
  then emits only safe metadata and hash values.
- Wrapper and migration bytes are hash-checked, inline inclusion occurs once,
  ROLLBACK uses `academy_digest_commit=false`, and COMMIT uses `true`.
- Commit output retains only whitelisted command markers, hashes, SQLSTATEs and
  booleans. It does not emit archive contents, cookies, or SQL input.
- On transport uncertainty, the packet retains maintenance, inspects marker and
  schema first, does not retry COMMIT, and never returns to old `90` after a
  committed or uncertain commit. Database restore remains separately authorized.

## Deterministic mock regression replay

- R1 control: stale same-schema archive reached one true-mode mock COMMIT call;
  its expected assertion failure demonstrates the prior gap.
- R2 stale receipt with a different ID/window produced
  `BACKUP_RECEIPT_DRIFT` and zero mock COMMIT calls.
- R2 fresh matching receipt produced one true-mode mock COMMIT call.
- R2 replay log SHA-256:
  `75bd8251dd838a09fbf5e3750ec18731392f9906995f1d1a4d52347379a92a01`.

This PASS is limited to the reviewed concrete operator controls; live cutover
execution and its receipts remain the root operator's responsibility.
