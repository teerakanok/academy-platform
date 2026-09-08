# Academy audit inspection0036 — production evidence

Source584f3b6 (original0de696a) adds two bounded latest-audit inspection functions for the accepted operator rehearsal CLI. Worker remains sourcefe4220a/version3830694b at100%; no web redeploy was needed.

- Independent source/operator review and actual local PostgreSQL causal acceptance: ../2026-09-08-operator-rehearsal/ (2466 unit passed,2 skipped; lint exactly3 existing executor errors/17 warnings).
- Exact operational packet review PASS; local guarded forward/inverse sequence exit0 within overall ROLLBACK, original two fixture functions remain.
- Pool A/postgres/academy only: canonical SSH docker psql supabase_admin transport, SET LOCAL ROLE postgres for function ownership; no operator grant, password, row, policy or table privilege changes.
- Production ROLLBACK05:53:45UTC exit0; exact packet COMMIT05:54:03UTC exit0. Fresh READ ONLY postcondition05:54:22UTC exit0 proves exact function bodies/owners/search_path/ACLs; activeOwners0/operatorPasswordConfigured0.
- Commands, SQL, complete projected output and source/file hashes are in the named receipts and manifest. No production credential or personal identity values included.
- **Do not replay0036.** The protected inverse verifies exact identity and drops only the two signatures without CASCADE; rehearse ROLLBACK before any recovery COMMIT. Do not erase audit rows or restore an entire shared database for this metadata change.
- Remaining: owner-provided0600 input files for new dedicated operator passwords, canonical founder issuer/subject, direct-role inspect→rehearse→apply, owner/learner browser acceptance. Metadata installation does not close those milestones.
