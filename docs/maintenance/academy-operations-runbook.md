# Academy Operations Runbook

Status date: `2026-09-02`

## 1. Before any production change

1. Read [`academy-system-inventory.md`](./academy-system-inventory.md).
2. Read [`academy-secret-registry.md`](./academy-secret-registry.md).
3. Confirm whether the target is Academy-only or shared infra:
   - Academy-only: Worker release, Academy data API, retention worker, Academy
     media bucket.
   - shared: Pool A host, shared PostgREST, shared auth, shared Cloudflare
     account policy, shared tunnel, shared identity issuer.
4. Confirm rollback target and backup point before mutation.
5. Never paste secret values into chat, repo files, screenshots, or ordinary logs.

## 2. Production verification checklist

Use these read-only checks after deploy, rollback, or incident recovery:

| Check | Expected result |
| --- | --- |
| canonical `https://academy.cyberskills.co.th` | `302` to Cloudflare Access while still gated |
| raw Worker route | `200` from current active version |
| deployment inventory | expected deployment ID and version ID present |
| residue check | `PASS` |
| Academy data API health | dedicated container healthy and route reachable |
| retention route | retention API and cron worker still isolated from runtime Worker |
| private media checks | invalid/tampered access denied before R2 read |
| identity callback path | exact callback path still reachable through Access gating rules |
| Account Center | root and `/health` return `200`; active Identity revision matches the approved immutable release |
| direct OTP without CAPTCHA | exact pinned-image denial before provider invocation and user creation; never accept a generic `500` as proof |

## 3. Runtime rollback surfaces

### 3.1 Academy Worker release rollback

- Source tooling:
  - `academy-web/scripts/academy-production-cloudflare-helper.mjs`
  - `academy-web/scripts/current-deployment.mjs`
  - `academy-web/scripts/academy-macos-release-recovery.mjs`
- Required proof before traffic change:
  - current deployment ID
  - current serving version ID
  - target rollback version ID
  - residue inventory / non-serving version inventory
- After rollback:
  - verify canonical `302`, raw `200`, expected target version active, residue `PASS`

### 3.2 Academy data API rollback

Follow [`../academy-data-api.md`](../academy-data-api.md).

Minimum sequence:

1. Disable `academy_api_authenticator` login.
2. Revoke Academy data API memberships if the capability itself is compromised.
3. Remove Worker secrets or disable the route before re-enabling with new credentials.
4. Restore only after a new authenticator password and new JWT secret are
   provisioned together.

### 3.3 Retention rollback

Follow [`../../academy-web/docs/academy-retention-scheduler.md`](../../academy-web/docs/academy-retention-scheduler.md).

Minimum sequence:

1. Stop retention schedule or worker route.
2. Remove retention secrets.
3. Revoke retention role memberships if compromise is suspected.
4. Reissue retention credentials together before reactivation.

## 4. Backup and restore expectations

### 4.1 Database

- Academy data lives in shared Pool A; Academy backup cannot ignore the shared
  host-level backup contract.
- Before Academy schema migrations or privileged SQL:
  - confirm current Pool A backup point exists;
  - confirm Academy-specific rollback SQL or reverse migration path;
  - verify no other product is relying on the same shared host change.
- Academy-specific restore verification should prove at minimum:
  - schema `academy` objects restored;
  - Academy roles/memberships restored;
  - dedicated Academy data API still exposes only schema `academy`;
  - runtime and retention JWT consumers reject stale or mismatched secrets.

Current gap: this repo does not yet contain a complete recorded Academy-on-Pool-A
restore rehearsal.

### 4.2 Private media / R2

- Bucket: `cyberskills-academy-media`
- Worker binding: `COURSE_MEDIA`
- Access model: signed cookie, no public object URLs

Restore verification should prove:

1. restored object SHA-256 matches the local registered source;
2. direct legacy public media URLs stay denied;
3. signed cookie flow works for PDF/video/captions;
4. missing/tampered/expired grants fail before object read.

Current gap: no product-local R2 restore rehearsal is recorded yet.

### 4.3 Identity dependency

- Academy depends on the shared Identity Control contract.
- Academy must restore its own callback/runtime wiring, but not fork or rebuild
  the ecosystem identity source of truth.

Restore verification should prove:

1. callback URI remains `https://academy.cyberskills.co.th/auth/callback`;
2. result audience remains `https://academy.cyberskills.co.th`;
3. client assertion input and result key set match the approved identity contract;
4. Academy still resolves learner identity by stable `(issuer, subject)`;
5. authorization and OTP submission require two distinct fresh Turnstile proofs;
6. OTP relay sender remains the approved root-domain sender and the protected
   CAPTCHA secret remains only in canonical root-owned custody.

## 5. Incident categories

### 5.1 Canonical site down but raw worker up

- Suspect Cloudflare Access / DNS / custom-domain routing first.
- Do not redeploy application code before confirming routing is the fault domain.

### 5.2 Raw worker down

- Inspect current deployment/version inventory and release residue first.
- If the active version is bad, roll back to a proven prior version before
  attempting unrelated infra changes.

### 5.3 Academy app cannot read data

- Distinguish between:
  - Academy Worker secret mismatch,
  - Academy data API container failure,
  - DB authenticator failure,
  - shared Pool A outage.
- Do not jump to `service_role` as a shortcut.

### 5.4 Media delivery broken

- Check `MEDIA_SIGNING_SECRET`, `COURSE_MEDIA` binding, and bucket object presence.
- Do not make media public as an emergency shortcut.

### 5.5 Identity sign-in broken

- Confirm shared Identity Control status and Academy callback/runtime config.
- Split the trace into Academy authorization start, Account Center transaction,
  fresh OTP challenge, GoTrue admission, provider acceptance, and delivery.
- Observe only status/category/count fields. Do not print recipient, challenge,
  one-time code, cookies, callback query, provider payload, or secret values.
- Do not ask the owner to retry until Account Center health, exact active
  revision, SMTP TLS/envelope admission, server-side CAPTCHA enforcement, and
  direct no-CAPTCHA rejection all pass.
- Permit exactly one real send while the owner is present, then classify the
  provider outcome before any further retry.
- Do not create accounts by email-join or local bypass on production.

## 6. Minimum post-incident record

Record:

- incident time window;
- affected surface;
- exact rollback / restore action;
- what backup or recovery evidence was used;
- what secret or credential was involved, by record name only;
- residual risk and next rehearsal needed.
