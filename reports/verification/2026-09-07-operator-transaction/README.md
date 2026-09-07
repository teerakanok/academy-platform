# Synthetic operator transaction acceptance

Each scoped enroll/cleanup now executes the same SQL with ROLLBACK first, validates its exact expected count, then executes COMMIT. Failed rehearsal has no commit invocation. Both transactions set local lock_timeout2s and statement_timeout8s; each docker/psql invocation has12s outer timeout. Exact subject/email matching, strict uniqueness, operation-bound receipt and cleanup rules remain unchanged. Runner and SSH host-helper integrity pins match the new source.

Root read all four file patches independently. Causal RED used the committed predecessor host with the new tests: failed missing second transaction and ROLLBACK predicate. Root restored exact candidate hash. Real PostgreSQL16 fixture gate exit0,8/8/no skips: rehearsal leaves prior state unchanged, commit applies, duplicates reject, unrelated user survives, ACCESS EXCLUSIVE contention yields database lock timeout below5s. Fixture was the existing named disposable academy_sec019_disposable database; schema absent before and after. Initial root invocation used a PostgreSQL URI accepted by libpq but rejected by JS URL parser; corrected the harness URI only before the successful run.

Root related runner/SSH/installer gates exit0,9/9; fullunit150files2441pass2skip; lint exit1 exactly the accepted3 no-require-imports errors in academy-bound-worker-executor.cjs plus17warnings. No downstream typecheck-success claim from the short-circuiting lint script.

Local source accepted only. No production install, SQL, migration replay or canary was performed. Production requires exact managed-source installation and actual learner/entitlement acceptance; historical migrations0021–27 and0029–33 must not be replayed.
