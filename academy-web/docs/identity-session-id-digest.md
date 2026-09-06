# Academy durable session identifier digest

The browser cookie remains the only holder of the 256-bit opaque
`academy_session` bearer. The current adapters call the explicit
`*_digest` PostgreSQL RPCs and never send the raw bearer. Durable session rows
and completed transaction receipts therefore contain only its SHA-256
base64url digest.

Authorization completion derives the same raw session ID on every retry from a
domain-separated SHA-256 input: the callback state and the browser-bound cookie
secret. Neither value can reconstruct the bearer from a database dump. The
adapter hashes that raw receipt before `claim` or `finalize` and maps a stored
digest back to the raw receipt only in process memory.

## Deployment phases

1. Disable the old Worker's public auth callback route, then wait at least 35
   seconds (the 30-second completion lease plus a bounded margin). This is an
   availability drain, not a quiet-window assumption: after migration the
   legacy raw claim/finalize RPCs fail closed, so a missed drain cannot expose
   or store another raw bearer.
2. Apply `0034` once. It takes an exclusive lock on both identity tables, hashes
   existing session IDs once, and records an atomic marker. Legacy transactions
   have their raw/random session linkage, lease, and completion marker cleared
   while retaining their checkpointed verified result; no session or transaction
   row is deleted. Their `attempt_count` is reset so a bounded retry can issue a
   deterministic receipt.
3. Deploy the new Worker. Existing browser cookies remain valid. During a
   mixed-version window, legacy code can read, create, and revoke sessions
   through raw-input compatibility wrappers that hash before storage, but its
   completion RPCs fail closed. New completion retries use deterministic
   digest RPCs.

Migration reapplication checks the marker before mutating data and aborts with
a check-violation error. Reapplying in a parent `ROLLBACK` rehearsal therefore
proves that PostgreSQL rejects the second execution without double hashing.

Roll back the application first if needed: the legacy session wrappers preserve
old cookies, while only in-flight/lost-response authorization callbacks require
a retry after rolling forward. Database rollback remains intentionally blocked;
restoring replayable identifiers would undo the security correction. Full data
recovery requires the independently verified pre-migration snapshot and an
explicit live-session decision, never a broad automatic restore or logout.
