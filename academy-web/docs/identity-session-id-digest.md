# Academy durable session identifier digest

The browser cookie remains the only holder of the 256-bit opaque
`academy_session` bearer. Both durable adapters send only its SHA-256
base64url digest to PostgreSQL. Durable session rows and completed transaction
receipts therefore contain a non-replayable identifier.

Authorization completion derives the same raw session ID for every retry from a
domain-separated SHA-256 input: the callback state and the browser-bound cookie
secret. Neither value can be reconstructed from a database dump: the state is
public but the browser binding is never persisted in raw form. The adapter maps
the stored digest back to that stable raw receipt only in process memory.

Migration `0034` hashes every existing session ID and every completed
transaction receipt in place. It does not delete or expire sessions. Existing
browser cookies continue to work because the application hashes the presented
bearer before lookup. For an old transaction still awaiting finalization, the
migration clears only its pre-fix randomly generated session linkage; after the
existing 30-second claim lease expires, the browser retry derives a stable
receipt and retains any already checkpointed exchange result. Deploy the
migration immediately before the compatible application version, during a
callback-quiet window where possible.

The hash transition is irreversible. The rollback script deliberately blocks
automated reversal because restoring raw identifiers would recreate the
credential-disclosure issue. Recovery requires the independently verified
pre-migration backup and an explicit operator decision about active sessions
and in-flight callbacks; it is not an automatic rollback path.
