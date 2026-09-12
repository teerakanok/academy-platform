# Academy maintenance admission (candidate; not deployed)

The Worker entry calls `admissionResponse` on every request after the served-host
gate. Admission opens only on the exact value `'open'`; a missing, malformed,
`maintenance`, or throwing binding read fails closed to 503 with
`cache-control: no-store` and `retry-after: 60` under the edge security-header
set. The current `wrangler.jsonc` declares `ACADEMY_ADMISSION_MODE`, and the
release validator accepts only the explicit modes `open` and `maintenance`. Unit
tests plus the real-workerd startup check prove that maintenance closes
application, static-asset, and media requests before any dependency binding is
read. The `scheduled` handler never reads `ACADEMY_ADMISSION_MODE`. No deployment
claim follows from the helper or its unit tests.

The scheduled lifecycle handler remains independent of HTTP admission. Maintenance
does not enable or repair lifecycle configuration: verified signed pulls still need
the exact approved producer contract and key bindings. Disabled/malformed lifecycle
configuration cannot count as catch-up evidence.

`wrangler.jsonc` sets `run_worker_first: true`, so every path — including
`/_next/static/*` and `/media/*` — reaches the Worker, where the host gate and
admission run before any asset read, and no SPA asset fallback exists. The
release validator requires `run_worker_first: true` and rejects any SPA fallback
configuration, and the build-time startup check asserts the same routing in real
workerd (raw-host static denial, canonical asset cache preservation). Deployed
Cloudflare vars and routing, including operator overlays, remain unverified until
read back and validated against the same release policy; a source build alone
does not prove live admission. A separately authorized release change must still
reconcile the effective routing, admission mode, and measured invocation cost
before maintenance admission can be accepted in production.

Migration 0041 requires a coordinated cutover: close admission with the new gate,
verify 503 on canonical application/media/static GET and HEAD and 404 on raw-host
paths, apply only the separately approved Academy migration, enable the approved
producer/consumer configuration, reach an authenticated empty page through the leased
puller, and prove the ready configuration/current principal projection/session guards
before explicitly opening admission. Do not apply 0041 to an open deployment with
missing projections: it intentionally denies those sessions.

Recovery keeps admission closed while investigating or repairing signed pull,
projection or erasure failures. Do not roll back to a Worker or SQL definition that
removes the durable denial guards, or treat disabling scheduled pulls as recovery.
The exact migration rollback/forward-repair boundaries, producer artifact and live
configuration receipts still require the parent-coordinated release packet and
independent approval. This document authorizes no live mutation.

`scripts/check-final-worker-startup.mjs` checks explicit source release configuration
and tests the bundled Worker in real workerd: maintenance before any dependency
binding, raw-host static denial, open asset cache preservation, scheduled handler
reachability and blocked external requests. Operator overlays and actual deployed
vars/routing must be separately validated against the same release policy and read
back; a source build alone does not prove live admission or lifecycle catch-up.
