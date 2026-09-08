# Academy active-user shape repair — production acceptance

Source `fe4220a1850d277d542cd5e30f38360776df4b15`, branch `security/csp-cde63a58`.
Worker `3830694b-bca9-4035-8bd0-e853ee6dd1fa` at 100%, deployment `3ecc5f51-2c30-4ce1-86c9-cdd2fb076b1a`, activated 2026-09-08 04:51 UTC.

After SQL0035 repaired activation writes, the real callback completed but the dashboard still rejected the session: PostgREST returned an active one-to-one object, while findActiveUser required an array. The reviewed two-file correction accepts the object and legacy single-item array, retaining canonical issuer/subject lookup and refusal of missing, inactive or ambiguous relations.

Root applied regression tests before the correction: 2 failed / 5 passed. After correction, unit 2459 passed / 2 skipped; three TypeScript checks and build:cf exit0. Lint retains exactly the existing 3 errors / 17 warnings. Independent review PASS binds exact source hashes. No further SQL mutation was performed for this release.

Pinned Wrangler versions upload --keep-vars exit0; explicit predecessor100/candidate0 allocation and fresh readback matched; candidate 22/22 host/CSP checks and real Chrome desktop/mobile captures passed. Guarded versions deploy candidate@100 exit0, separate inventory confirmed exact allocation. Production probe without override passed22/22 and both captures; root viewed both.

At04:52:37UTC, normal native Safari navigation using the owner's existing session stayed on /dashboard. Rendered text included My learning, Sign out, and no current enrollment; no redirect back to sign-in. Root viewed the bounded dashboard screenshot. Browser chrome/account navbar were excluded; email in the text receipt is redacted. No cookies, OTP values or credentials were extracted. The earlier normal Continue callback completion plus this same-session dashboard acceptance closes the reported observed login loop; this does not assert every possible fresh-login or revocation journey.

Rollback predecessor remains `8318899f-74ef-4223-8603-5f6508a5d2d4`; inspect current allocation/compatibility before any rollback. SQL0035 is already committed and must not be replayed. Staff/entitlement, learner progress, sign-out and complete cross-product playtest remain open.

GLM5.3-flash/max work order wo-e00e2245-6882-40a6-8779-09d6a0ed5cfe completed in about4m51s; exact patch d5ff9854057300a94ec1017fa9d8895210713c898c0b7ca3b0c057e9d3d0c887 was accepted after root causal gates and independent review. Provider result formatting was advisory-quarantined; task acceptance is separately successful, not waste. Token usage remains unknown. Legacy finalize requires valid provider advisory and the unchanged baseline HEAD, so it was not fabricated or forced after acceptance.

Probe attempts r2/r3 failed before HTTP because of an incorrect working directory. Access token readiness was separately confirmed; r4 used academy-web and passed. Those failures are apparatus errors, not product or credential failures. This repeats an earlier known cwd issue: future reuse must retain the executable's recorded cwd, and credential requests require an actual credential-readiness failure.

Each copied artifact is bound in manifest.json. Temporary full test logs remain in the session records with hashes in the receipts; ordinary artifacts contain no secret values.

At04:57:26UTC, normal Safari GET /api/auth/me returned parsed JSON signedIn=true; only booleans were retained. The browser was returned to Dashboard. Independent bounded SEC-ACADEMY-002 review PASS closes the original auth-gate criterion; checklist Status/Checked on updated2026-09-08. Other journey criteria remain separate.
