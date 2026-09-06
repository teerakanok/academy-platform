# Staff and manual entitlement candidate

Not deployed or independently approved. Base efd457b; integrate after content+harden main a5e2ee8.

Parent ran `npx vitest run --project unit`:2152 passed; `npm run build:cf`:exit0;
`npm run lint`:exit1, exact pre-existing3 require-import errors in academy-bound-worker-executor.cjs and16warnings.
Disposable PostgreSQL migration rehearsal used ROLLBACK before COMMIT and ownership-verified cleanup.
`node /private/tmp/cyberskills-prod-cde63a58/academy-staff-rollback-green.mjs`:exit0,6/6 integration tests.

Independent first review reported role collision, owner-revocation race and rollback credential retention.
Parent reproduced each with actual PostgreSQL failing-first tests (raw evidence alongside):
- Revocation can commit while a grant uses the old owner state. Shared staff advisory lock now precedes owner authorization.
- Existing operator role was adopted/reset. New role name collision now refuses migration; unexpected existing staff flags, password presence, membership or ownership also refuse before login activation.
- Rollback left a provisioned staff credential. Rollback now sets NOLOGIN and PASSWORD NULL.

Role/rollback tests execute inside a disposable transaction; rollback script transaction wrappers are removed only in the test so the outer fixture transaction can restore its schema. The actual rollback artifact retains its transaction boundary.
Review closure and production migration, host gate, authenticated operator verification remain required.
