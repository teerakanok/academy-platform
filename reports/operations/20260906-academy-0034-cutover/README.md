# Academy session-ID digest production cutover — completed

This record ingests safe, command-matched production receipts from the
authorized operator. It contains no backup contents, browser capture, cookies,
credentials, or secret values.

## Result

Migration `0034_identity_session_id_digest.sql`
(`6355c54a468884008373876565443a6a5456e4005c2026377f46a8a449be66f0`)
committed successfully under reviewed wrapper
`11f942279ea4012566e9f49b5563b7b3d33c73ea89f30cff96d50a5928a96e4f`.
The forward deployment is `a0a9961e-da7f-48f8-b835-3024704dfbbf` with
`1af77a26-bba2-4300-9a71-0bc0262ca06d` at 100%, sourced from application
revision `0e4417ec4e2909f05ab4eb9f3269bcb1c58c184b`.

The maintenance pause ran from 2026-09-06T22:45:39Z through
2026-09-06T22:50:26Z. Drain evidence recorded zero active claims and zero held
identity-table locks after 37.18 seconds. No old `90c390b5…` rollback occurred
after COMMIT and migrations `0029`–`0033` were not reapplied.

## Database and recovery evidence

- Fresh Academy-schema backup: `/root/academy-db-backups/20260906T224627Z-digest-0034-cde63a58/academy.dump`,
  SHA-256 `38d1f122a74b31a986aeeb36498b8f261c2290f92069bbab7297cdfaacbbd8af`,
  259138 bytes, `0600`; archive listing passed and no restore ran.
- ROLLBACK rehearsal exited 0 with schema SHA unchanged at
  `003eb7eeccd4c5167152ddbb52857b362c1c6f2d6b90f7d2249fb86300dce036`.
- COMMIT exited 0 and changed the Academy schema SHA to
  `711417a011d2a542a31f8bb776f29abb5b69b64fc715d5b8ef9e5664d7f4d162`.
- Read-only postverify: marker 1, sessions 1, transactions 2, invalid digests
  0, active claims 0, legacy links 0, five digest RPCs, and runtime grants true.

## Forward-resume correction

Direct deployment of `bd109…` was rejected with Cloudflare `10220` because
`IDENTITY_RUNTIME_ENABLED` changed while the maintenance version was active.
No force or API override was used. With `f126…` confirmed as latest, the
documented `versions secret put` path created `1af77…` with the runtime flag
enabled. Its script matched the reviewed candidate and its 17 binding names and
types matched; the receipt records the flag change without exposing a value.

## HTTP evidence and boundaries

Authenticated canonical `/` and `/sign-in` each returned 200; the raw Worker
host returned 404. The corrected authenticated canonical `/robots.txt` request
returned `text/plain` 200 with robots directives and no Access-login body.
The initial raw robots request returned an Access body and is explicitly
superseded; it is not product proof. A browser capture was viewed by the
operator but intentionally is not copied here.

The database had no session with more than the 120-second compatibility margin,
so the wrapper reported the permitted skipped compatibility status. There is no
production active-cookie canary proof. The completed cutover does not establish
a fresh learner sign-in, callback completion, or dashboard journey.

After the timestamp-specific database postverify (two transactions), the
operator began one real browser authorization journey: the Academy sign-in
Continue action reached Account Center `/sign-in` with the expected query key
names. The email and Turnstile form was viewed but neither email nor challenge
was submitted. This is a safe continuation receipt, not a completed sign-in;
later transaction counts must not be compared to the earlier postverify count.

See `receipts/` for immutable copied JSON and `RECEIPTS.sha256` for their
source-verified hashes. The copied operator scripts and independent R2 review
are retained for continuation only; they grant no new live authority.
