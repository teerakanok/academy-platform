# Academy production release and routine maintenance

Procedure source: `reports/handoffs/20260905T090323000Z-session-close-academy.md` and the reviewed operations runbook. The handoff's original version and sign-in-loop status are historical; inspect the active deployment and current continuation before choosing a release. This guide carries no live authorization into another session.

## Routine maintenance

Read the system inventory, operations runbook and relevant data-API/retention documentation in this folder. Check canonical host gating, current Worker deployment, data API health, retention job execution, private media denial paths and authenticated learner navigation. Capture scoped evidence without cookies, authorization headers or credential values.

Academy consumes Identity; course entitlement, staff roles, progress and grades remain Academy-owned. A healthy Account Center does not establish Academy session propagation. Test a fresh authorized sign-in, then dashboard/course access, account suspension and sign-out against production before declaring the learner journey ready.

Preserve detached entitlement audit and applicable retention holds during erasure. Do not use a schema rollback as an automatic response to an incident. Use the bounded recovery procedures in `academy-operations-runbook.md` and retain the current serving version, proposed rollback version and residue inventory.

## Prepare source and database

1. Select the exact reviewed release SHA in an isolated worktree. Integrate content before hardening, then design and new features; inspect overlapping paths per commit. Do not switch a shared checkout or import unrelated pending changes.
2. In `academy-web`, run `npx vitest run --project unit`, `npm run lint` and `npm run build:cf`. The known lint baseline is three require-import errors in `scripts/academy-bound-worker-executor.cjs`; distinguish these from new errors. Since eslint failure short-circuits the lint chain, separately verify app, Worker and retention TypeScript configurations.
3. For lifecycle, session or entitlement changes, retain the actual disposable PostgreSQL integration and independent security review. Passing unit fixtures alone do not prove live roles, RLS, authority or migration behavior.
4. Inspect the production migration ledger and exact pending SQL. Rehearse each intended database change with ROLLBACK, validate affected rows/roles/policies and then COMMIT under current authorization. Do not apply a whole directory blindly. Migrations0029 and later in the current development program are not assumed deployed by this guide.
   Production operator fact (2026-09-06): Pool A `postgres` is **not** a superuser. Keep new migration object ownership under `SET LOCAL ROLE postgres` from an authorized `supabase_admin` connection; use `RESET ROLE` only for the exact privileged retention owner/grant statements, then return to `postgres`. Never broaden permanent role memberships to make a migration pass. The `academy` schema has no migration ledger; compare live catalog to the exact applied receipts at `reports/operations/20260906-academy-0029-0033/` before deciding what is pending. Migrations0029–0033 are now applied; do not blindly repeat0030 role creation.
5. Keep a verified serving version available for rollback. Ensure its code remains compatible with retained database changes; do not reverse security-sensitive schema merely to restore old code.

## Upload, smoke and activate the Worker

The actual handoff procedure is version upload followed by verification and an explicit traffic change:

1. From `academy-web`, finish `npm run build:cf` for the approved source.
2. Run the repository-pinned Wrangler `versions upload --keep-vars` for `cyberskills-academy`. Record the returned version ID and release source tag; uploading does not mean that version is serving traffic.
3. Smoke the uploaded version using the existing release helper/probe procedure. `ACADEMY_SERVED_HOSTS` may include an explicitly approved temporary probe host only during the probe. Preserve the canonical-host gate; a raw workers.dev404 is an expected gate result, not evidence that the candidate's authenticated UI passed. A version-override header only requests a candidate and can fall back to the deployment allocation. Before calling a candidate smoke verified, correlate one sanitized override request with candidate-specific Worker observability, or with an intentionally issued non-secret candidate version marker. A matching status, Access redirect, or response body alone is not attribution. If that correlation is unavailable, record the smoke as unattributed; it cannot prove candidate acceptance. Under current authority, the exact reviewed activation path may instead establish the serving version through a provider allocation receipt and version-bound postchecks with the retained rollback version. Do not upload another version merely to create attribution evidence.
4. Use Wrangler `versions deploy` to select the exact verified candidate version and intended allocation. Retain the previous deployment/version IDs and actual command output. Do not use an unreviewed default version or infer success from build output.
5. Monitor long build/upload/deploy commands in background. On ambiguous completion, inspect deployment state before repeating a mutation.

The source helpers are `academy-web/scripts/academy-production-cloudflare-helper.mjs`, `current-deployment.mjs` and `academy-macos-release-recovery.mjs`. Use the reviewed helper contract for inputs and recovery; this guide does not replace it with another deployment mechanism. Read the installed Wrangler skill before invoking the CLI.

## Verify production

Run the handoff's read-only checks and retain their real output:

```sh
wrangler deployments list --name cyberskills-academy
curl -sS -o /dev/null -w '%{http_code}\n' https://cyberskills-academy.songpon-te.workers.dev/
curl -sS -o /dev/null -w '%{http_code}\n' https://academy.cyberskills.co.th/robots.txt
```

Expected raw-route404 follows the host gate. Canonical routes may return302 to Access while gated; verify the exact allowed public route and access context rather than assuming a historical200. Match deployment/version/source to the intended release. Open the real browser for fresh sign-in → dashboard → course → protected content and staff/manual-entitlement flows. Use `skills/academy-production-playtest/SKILL.md` for the authorized canary. No payment-ready claim is valid until payment is selected, implemented and proved; manual entitlement is the current authorized path.

Lifecycle pull additionally needs exact producer endpoint/audiences/key snapshot, scheduled execution and live revocation proof. Missing producer configuration must not be relabeled as a completed integration. Keep Access and internal course visibility as currently authorized until the explicit launch decision.

## Content maintenance

Crucible is the source of truth, including the eight Academy courses. Apply en/th corrections together there, preserve answers unless proven wrong, pass content and checkpoint-answer-bias gates, then use the director course-content-import skill to regenerate and verify the projection. Security+/ISC2 CC remain internal until an explicit visibility decision. Avoid editing generated Academy content as the source.

## Key inventory — final owner discussion pending

This release guide intentionally leaves the table blank until the final owner discussion. Existing secret inventory records remain unchanged. Never include values or request vault access; new owner-supplied credentials use the approved0600 file custody procedure.

| Key name | Stored where | Rotate when |
|---|---|---|
| | | |


## Verified public-course release — 2026-09-07 08:50 UTC

Current app source `5572e8318b67ebf7858c4c1fccf1831ae01d335f`, Worker `0eed364a-1714-4e03-bf62-0af2230cfb55` at100%, deployment `733e4fa3-52c4-4717-b3da-aed3aafe5023`. The existing versions-upload/0%-candidate/override-smoke/100%-activation flow was used. All16 public localized course pages return200 after activation without a version override; authenticated lessons still redirect to sign-in and raw host404. Root viewed realChrome1440x900/390x844. Proof: `reports/verification/2026-09-07-public-course-cache-production/`. Build must run the cache sync before upload; uploading assets without generated prerender cache caused the prior course404. Predecessor `56c2e7bd-26be-4d68-bda1-70df901e6187` remains the rollback version. Authenticated learner/entitlement/operator acceptance remains open.

## Verified Linux content release — 2026-09-07 09:08 UTC

Supersedes the serving version in the preceding release record. Source `9ad69fd8de46bb4f0d2be900372d4eec4f19e8b9`, Worker `33a85d92-6a72-42f5-8a74-7a5a3a5c633b` at 100%, deployment `937de442-b8ce-4a06-8328-ee75817cf045`. Rollback predecessor `0eed364a-1714-4e03-bf62-0af2230cfb55`. Post-activation public route and real browser proof: `reports/verification/2026-09-07-linux-capstone-production/`. Authenticated learner and operator acceptance remain open.

## Verified Git content release — 2026-09-07 14:00 UTC

Supersedes the serving Linux version above. Source `af3f5ded63fc491b09b55980bfb5f3cf3fb943ab`, Worker `772b75a6-e06b-404b-a268-5dbb4ec24e86` at100%, deployment `2771c927-fa16-42fc-9730-d5fe3321d5e1`; rollback predecessor `33a85d92-6a72-42f5-8a74-7a5a3a5c633b`. Post-activation evidence and real browser captures: `reports/verification/2026-09-07-git-capstone-production/`. Authenticated learner/operator gates remain open.
