# Academy activation permission repair

Migration source `22887df` / 0035 SHA256 `2dffae6647191714f3e3456432584c96ff40bd7cca6ea19cea7fe822b090acc4` was committed on Pool A database postgres at 2026-09-08T04:21:54Z using the independently reviewed r3 packet and existing supabase_admin operator. Protected backup and exact metadata inverse are retained. Live ROLLBACK rehearsal, COMMIT and separate READ ONLY postverify all exited 0. The earlier postgres-operator attempt was rejected by the capability guard before migration; no role was escalated.

Actual local runtime-role tests reproduced SQLSTATE42501 before repair, then proved activation, session creation/read, monotonic revision and direct-write denial after repair. Root unit gate passed2452/2skipped; lint retains only3baselineerrors17warnings. Independent source and operational reviews passed.

After this change the real owner browser completed authorization: production callback aggregate shows completed1, checkpointed1, failure stage none. **Login acceptance is still OPEN** because currentUser rejects the actual to-one PostgREST activation object; the browser returns to sign-in without the former error notice. The safe runtime API probe returned HTTP200, activationShape=object, activationStatus=active. That application response-shape defect is the next bounded correction; do not reapply0035 or roll back this completed SQL repair to address it.

The Worker is unchanged at8318899f-74ef-4223-8603-5f6508a5d2d4. Receipt files contain only safe projections and executable commands; no credential values, user identities, raw cookies or tokens are included. manifest.json binds exact copied bytes. The 0035 inverse restores metadata only and must refuse drift; it is not authority to restore business data.
