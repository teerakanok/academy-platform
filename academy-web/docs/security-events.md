# Academy security events

Server-only auth and authorization decision sites emit one fixed JSON schema:
`schema_version`, `event`, `category`, `outcome`, `reason`, and UTC `time`.
Only the event/category/outcome/reason combinations compiled into
`src/lib/security/security-events.ts` are admitted; identifiers, cookies,
credentials, URLs, paths, request bodies, and raw errors are never accepted.

Each server isolate can invoke the logger at most 256 times. The first event
after the 255 regular events reaches that limit emits the final allowed
`security_event_budget` record with the count observed at that moment.
Everything after that summary is dropped without another per-event record;
the internal count saturates at `Number.MAX_SAFE_INTEGER`. Reset or replacement
of an isolate starts a new budget. This is not a global aggregate completeness
guarantee. Existing edge admission and Durable Object rate controls bound
request arrival before these callsites, but platform log delivery, retention,
durable principal correlation, and cross-isolate audit remain open.


