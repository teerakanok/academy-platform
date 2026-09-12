# OWASP Top 10 Source Assessment — Academy

Date: 2026-09-11  
Baseline: `bf74fbffd565694510815593f74f7a4b1a1e4b67`  
ASVS source: `asvs-5.0.0.json`, SHA-256 `8201b20eec2908c3380ac600c91c8ba746346fbb808859366abb232027532311`  
Full requirement-by-requirement evidence: `reports/security/2026-09-11-asvs-source-assessment.json`

## Result

This is a source-only applicability/evidence assessment, not a security pass or production approval. The matrix contains 345 unique pinned requirements: 47 `SOURCE_SUPPORTED`, 255 `OPEN`, and 43 `NOT_APPLICABLE` to features explicitly absent from this baseline. Source support means concrete code, schema, test, or documentation evidence was found; it does not prove deployment state, host configuration, database permissions, key custody, live Identity behavior, or operational monitoring.

No dependency installation, build, secret access, live service access, or cross-project scan was performed.

## Strong Source-Supported Seams

- Input and injection boundaries use byte-bounded JSON parsing, exact key/type schemas, Zod validation, contextual React rendering, strict URL policy, typed Supabase RPCs, and PDF escaping.
- Mutations require explicit methods/content types and same-origin/`Sec-Fetch` metadata; server-only projections limit account/course fields and answer-key exposure.
- Course attempts, progress, entitlements, and Identity completion use server-side SQL state, atomic transactions, leases, and bounded audit records.
- Production sessions are opaque 256-bit random IDs in `__Host-`/`HttpOnly`/`Secure` cookies, with database-side SHA-256 session digests and revocation.
- Identity integration checks issuer/subject separation, ES256 signatures, trusted keys, audience, nonce, transaction state, and token lifetime. Private media requires an exact, session-bound, expiring HMAC grant.

## Highest-Impact Open Seams

1. **SSO termination is unprovable (`v5.0.0-7.4.1`, `v5.0.0-7.6.1`)**: Academy backend revocation and cookie expiry exist, but the browser calls the Identity sign-out endpoint with `no-cors` while CSP `connect-src 'self'` prevents the request. IdP termination, current-device logout completeness, and RP/IdP reauthentication boundaries remain open.
2. **CSP is below the ASVS minimum (`v5.0.0-3.4.3`)**: the policy sets `base-uri 'self'` rather than `none` and allows `style-src 'unsafe-inline'`. Violation reporting (`v5.0.0-3.4.7`) and `Cross-Origin-Opener-Policy` (`v5.0.0-3.4.8`) are absent.
3. **Course visibility fails open (`v5.0.0-8.2.2`, `v5.0.0-15.4.2`, `v5.0.0-16.5.3`)**: `course_settings` database errors fall back to static build-time visibility. For a course whose static state is public, an override intended to hide/retire it cannot be read and the learner surface can remain visible.
4. **Authorization propagation is not immediate (`v5.0.0-8.3.2`)**: Identity lifecycle pull is disabled. Suspension, deletion, and newer activation revisions cannot be proven to invalidate existing sessions/resources promptly.
5. **Public certificate verification lacks an edge rate rule (`v5.0.0-2.4.1`)**: the endpoint is explicitly public and returns only bounded status, but no matching edge-rate bucket was found.
6. **Privacy launch gates remain open (`v5.0.0-14.1.1`, `v5.0.0-14.2.4`)**: final processor names/locations, transfer grounds/contracts, privacy notice, and full PDPA protection-level evidence are pending. Current consent evidence is strongest for versioned waitlist marketing consent/withdrawal.
7. **Dependency assurance is stale by evidence (`v5.0.0-15.1.1`, `v5.0.0-15.2.1`)**: lockfile and SBOM exist, but no dated 2026-09-11 advisory/provenance result proves current SLA compliance.
8. **Logging/alerting is incomplete (`v5.0.0-16.1.1` through `v5.0.0-16.4.3`)**: sanitized local errors exist, but there is no complete inventory, protected separate store, correlation/UTC proof, or authentication/authorization/control-bypass alert coverage.

Additional operational gaps include proxy/header trust, HTTP protocol framing, TLS/certificate configuration, DB/host permissions, secret vault records, key rotation, production bundle exclusion, asset leakage, and browser storage/cache behavior. These remain open at their owner boundaries.

## OWASP API Security Top 10 — 2023 Mapping

Official classification source: <https://owasp.org/API-Security/editions/2023/en/0x11-t10/>

| Official 2023 risk | Academy mapping and current state | Principal ASVS IDs |
|---|---|---|
| API1:2023 Broken Object Level Authorization | Account/course checks, default-deny SQL, and media session binding are source-supported; course visibility fail-open and delayed lifecycle propagation remain open. | `8.2.2`, `8.3.1`, `8.3.2` |
| API2:2023 Broken Authentication | Delegated Identity, PKCE/client assertion, backend opaque sessions, and signature checks are visible; provider password/MFA lifecycle, live propagation, and SSO sign-out need owner evidence. | `6.*`, `7.*`, `6.8.*`, `7.4.1` |
| API3:2023 Broken Object Property Level Authorization | Server-only projections and exact schemas limit fields; a complete field-policy inventory and live projection tests remain open. | `8.2.3`, `15.3.1` |
| API4:2023 Unrestricted Resource Consumption | Bounded bodies, edge quotas, authenticated mutation quotas, and Durable Object limits exist; public certificate verification and deployed protocol/limit behavior remain open. | `2.4.*`, `4.2.*`, `15.1.3`, `15.2.2` |
| API5:2023 Broken Function Level Authorization | Staff/operator functions use explicit SQL roles and owner runbooks; Cloudflare Access posture and layered admin verification are not evidenced. | `8.2.1`, `8.4.2`, `13.4.5` |
| API6:2023 Unrestricted Access to Sensitive Business Flows | Attempt/progress/entitlement state machines and quotas are strong; realistic timing, live quota persistence, and all costly flows need executable proof. | `2.3.*`, `2.4.*` |
| API7:2023 Server Side Request Forgery | No user-directed outbound URL feature was found; fixed Identity/media endpoints and HTTPS URL policy are source-supported. Egress allowlists remain operational evidence. | `1.3.6`, `13.2.4`, `13.2.5` |
| API8:2023 Security Misconfiguration | Edge headers and default-deny routing exist; CSP minimum, COOP/reporting, debug/TRACE/metadata/version exposure, and platform TLS/configuration evidence remain open. | `3.4.*`, `12.*`, `13.4.*` |
| API9:2023 Improper Inventory Management | SBOM, secret names, Identity authority, and data register exist; current advisories, complete communication/resource inventory, key/processor inventories, and deployed endpoints need reconciliation. | `11.1.*`, `13.1.*`, `14.1.*`, `15.1.*` |
| API10:2023 Unsafe Consumption of APIs | Identity responses/events use strict algorithms, key, audience, nonce, type, shape, and lifetime validation; outbound redirect/limits and provider conformance remain open. | `4.2.5`, `9.*`, `10.3.*`, `15.3.2` |

## OWASP Web Top 10 — 2025 Mapping

Official classification source: <https://owasp.org/Top10/2025/>

| Official 2025 risk | Academy mapping and current state | Principal ASVS IDs |
|---|---|---|
| A01:2025 Broken Access Control | Object/function authorization and fetch-metadata controls are source-supported; visibility fail-open, lifecycle latency, admin posture, and cross-origin resource isolation remain open. | `3.5.*`, `8.*` |
| A02:2025 Security Misconfiguration | HSTS, nosniff, framing, referrer, permissions, and default-deny routing exist; CSP exact minimum, COOP/reporting, platform TLS/headers/debug exposure, and secret/host configuration remain open. | `3.4.*`, `12.*`, `13.*` |
| A03:2025 Software Supply Chain Failures | Lockfile and SBOM exist; current advisory evidence, trusted provenance, risky-component inventory, production bundle minimization, and isolation remain open. | `15.1.*`, `15.2.*` |
| A04:2025 Cryptographic Failures | SHA-256, HMAC, ES256, CSPRNG IDs, and digest storage are visible; complete crypto inventory/agility, vault custody/rotation, in-use encryption, and platform crypto evidence remain open. | `11.*`, `12.*` |
| A05:2025 Injection | React contextual output, strict JSON, safe URL policy, parameterized RPCs, and PDF escaping are source-supported; deployed exhaustive injection testing remains open. | `1.*`, `2.2.*` |
| A06:2025 Insecure Design | Atomic attempt/entitlement flows and explicit privacy runbooks are strong; consolidated validation/business/contextual policy and operational failure designs remain open. | `2.*`, `14.1.*`, `15.*` |
| A07:2025 Authentication Failures | OIDC boundary controls and durable opaque sessions are visible; Identity password/MFA/recovery behavior, SSO termination, lifecycle propagation, and reauthentication policy remain open. | `6.*`, `7.*`, `10.*` |
| A08:2025 Software or Data Integrity Failures | Signed Identity events/results, locked dependencies, atomic state transitions, HMAC media grants, and audit records exist; deployment/key/dependency integrity and production data checks remain open. | `9.*`, `10.*`, `15.2.*`, `15.4.*` |
| A09:2025 Security Logging and Alerting Failures | Some sanitized errors and learner telemetry exist; complete security-event, correlation, separate protected storage, alerting, and escalation evidence is missing. | `16.*` |
| A10:2025 Mishandling of Exceptional Conditions | Many routes return sanitized generic failures, but course-settings fallback is fail-open and last-resort/external-resource degradation behavior is not exhaustively evidenced. | `16.5.*`, `15.4.*` |

## Reconciliation Note

The controller must reconcile this matrix against the final diff, protected-path policy, executable gates, and independent review. `SOURCE_SUPPORTED` must not be converted to “PASS”; live host, database, Identity, Cloudflare, vault, dependency-advisory, browser, logging, and privacy gates remain separate unless their own evidence closes them.


