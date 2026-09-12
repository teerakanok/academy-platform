# Academy access, export and erasure procedure

Candidate procedure for SEC-ACADEMY-023; independent review and an isolated fixture rehearsal are required before an operator uses it. This document creates no shared database or Identity authority. The request owner uses the restricted case system described in `request-runbook.md`; source control and application logs are not case storage.

## Verify and scope the request

1. Verify control of the canonical account through its authenticated account workflow. An email string alone is insufficient. Resolve exactly one Academy `users.id` from verified issuer and subject; record only the case reference in operational receipts. Identity conflicts stop the request.
2. Record whether the request covers Academy data only or the canonical Identity account. Academy-only requests must not delete Identity, Crux, or another service's activation/data. Route canonical account requests to the Identity owner through the approved case workflow.
3. Review open appeals, active staff responsibility and other documented holds. Name the record, purpose and expiry of each hold. A hold must not be used to keep an otherwise revoked session usable.
4. Prepare a bounded, parameterized operation against the exact Academy schema and verified account ID. Independently review its row predicates, projected columns, expected counts and recovery boundary before a live operation. Runtime application credentials are not an operator export capability.

## Access and portable copy

Use one read-only repeatable-read transaction with a statement timeout. Every query binds the verified account ID or separately verified email as a value; never interpolate request text into SQL. Page large collections in a stable primary-key order and reconcile page counts within the same snapshot. Do not export another user's data through actor, reviewer or appeal relationships.

| Record | Subject boundary | Export content |
| --- | --- | --- |
| `users` | exact canonical account ID | verified profile, creation/activity dates |
| `service_activation`, `course_entitlement` | `user_id` | service/course status, source and expiry |
| `node_progress`, `course_progress_epoch`, `course_progress_reset_operation` | `user_id` | learning status, timestamps and reset history; exclude internal receipt credentials |
| `attempt`, `attempt_appeal` | `user_id`, or appeal joined through that user's attempt | learner submissions, recorded result, relevant dates and their own appeal status; exclude answer keys, grading internals and other people's narratives |
| `course_certificates` | `user_id` | certificate number, course/version, issuance/revocation and the subject's evidence summary |
| `leads`, `consent_events`, pending intake when deployed | separately verified normalized email; consent events joined through matching lead | request/consent/withdrawal text version, source and dates; exclude unsubscribe credentials |
| `privacy_request` | verified subject and current case authorization | request type, status and dates; restricted case narratives remain separately reviewed |
| Staff and entitlement audit | subject account ID with explicit third-party redaction | the subject's access decisions; redact other actors' identifiers and internal authorization references unless specifically authorized for disclosure |
| Identity lifecycle/session/authorization tables | exact issuer and encoded subject | explain current access state and session count/dates if relevant; never export session identifiers/digests, PKCE verifier, nonce, browser binding, assertion, lease token, bearer or private key |

Create the portable UTF-8 JSON in the approved private case artifact store with restrictive access and a short expiry. This procedure does not generate spreadsheet/CSV output; adding that format requires a separately verified formula-injection-safe exporter. Check schema, subject count, absence of credential fields, and third-party redaction before delivery. Deliver only through the verified recipient channel; record checksum, size, expiry and receipt in the restricted case system. Do not attach personal exports to Git issues or the security review report. Remove the temporary export after its approved expiry and verify deletion; retain only the minimal case receipt.

## Erasure and restriction ordering

1. Resolve scope and holds before selecting a mutation. For canonical Identity deletion, the Identity owner records the lifecycle transition; Academy consumes the signed event through its existing leased cursor. Never manufacture a deleted projection from an unauthenticated request.
2. Revoke or restrict access before removing the profile. Confirm the effective durable lifecycle guard denies protected operations and existing sessions, including concurrent callback/session minting. A failed erasure transaction is not permission to restore access or report success.
3. Inventory all actual foreign keys and non-FK principal references at the deployed migration version. Include `identity_session`, authorization transactions, lifecycle tombstone, certificates, `course_settings.edited_by`, progress, attempts, appeals, entitlements, staff assignments/audits and waitlist records. Preserve the lifecycle tombstone required to prevent stale callback resurrection.
4. Apply only the reviewed exact-subject operation. Detach retained authorization audit attribution under its existing retention policy. Certificate retention/detachment and Academy-only erasure tombstones require their explicit product policy and executable migration; they must not be improvised with a blanket cascade.
5. Verify zero usable sessions, denied stale callback, denied learner/media/administrative access, expected removal or documented hold for every mapped record, and unchanged unrelated account counts/representative journeys. If cleanup fails, retain the request as pending and retry idempotently; do not claim erasure complete.
6. Record the minimal case outcome and remaining held records without query bodies or personal data in operational logs. A restore rehearsal must replay restriction/tombstone state before restoring service, so a backup cannot resurrect access.

## Release evidence still required

The restricted case system and authorized operator identity must be observed, not assumed. Rehearse a two-user export and erasure fixture, including a certificate, an open appeal/hold, a staff reference, a failed deletion and retry, stale callback, and unrelated-account preservation. Independently review both the procedure and the executable operation. This procedure does not claim that self-service export/deletion, a live request case or certificate erasure policy has been implemented.
