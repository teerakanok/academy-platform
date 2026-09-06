# Academy database hardening applied; Worker release pending

Source: 4b89baf079a4618393febc6f3479393efac6ee80, branch integrate/academy-release-r2-cde63a58 and main pushed. Unit2426, real PostgreSQL2, TypeScript3 configurations and Cloudflare build pass; baseline lint3 errors/16warnings. Code integration evidence remains artifacts/academy-integrated-r2.

On 2026-09-06 the operator read the real Pool A catalog: postgres is NOSUPERUSER, supabase_admin is the actual superuser, and no Academy migration ledger exists. Pending0029–0033 objects were absent. Do not infer application from a nonexistent ledger: use catalog and exact operation receipts.

Backed up only Academy schema+data through existing host pg_dump workflow to root-owned0600 /root/academy-db-backups/20260906T1610Z-release-4b89baf-cde63a58/academy.dump; SHA256 e1b47e9dab9a532bafa5fe842237f9216ff2905cfcdf168e974c9e3e9a114183,206687bytes,273 archive entries. Archive listing is verified; this is not a new restore rehearsal.

First transaction aborted at retention ownership under NOSUPERUSER postgres, with before/after schema and role hashes unchanged. Corrected execution connects as supabase_admin, SET LOCAL ROLE postgres for exact reviewed migrations0029–0033, RESET ROLE only for the tracked new retention function owner/grant statements, then returns to postgres. Exact bodySHA3221991d805026fba0dd9ebb28ce1b8c5da335600f60783b9bd67bd9ba9686c8 rehearsed with actualROLLBACK and unchanged baseline, then separate baseline-pinned COMMIT. Both command receipts exit0; postconditions passed. Independent read-only postverify passed; retention owner academy_retention_definer, new operator password unset. PostgREST schema reload notification rehearsedROLLBACK thenCOMMIT. No account deletion, entitlement decision, credential provision, or DB downgrade was performed.

Worker upload for4b89baf failedCloudflare10021 at actual runtime startup: server-only import from scheduled lifecycle composition. Assets uploaded but no Worker version created; versions list still ends at42 (6c2e3881-4836-4bee-8bd1-b6e5368b6def). No traffic activation. Correction in separate fix/academy-worker-startup-cde63a58 must prove final emitted bundle starts in realworkerd before another upload. Keep previous serving version and Access/host gates.

Database capability proof does not close application/lifecycle/content findings: live producer configuration, authenticated browser workflows, assessment bank expansion and remaining security items are open. Never roll back0032 automatically to definitions that can resurrect erased profiles.
