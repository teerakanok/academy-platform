# Academy data processing register

Last reviewed: 2026-08-04

This register covers the current Academy release. Recheck it before adding payments,
certificates, analytics, new processors, or a new data destination.

| Data | Purpose and legal ground | Retention | Enforced by |
|---|---|---|---|
| Waitlist email, source, consent time and wording | Send opted-in launch, course, and promotional email; consent | 3 years from the current grant, a fresh grant after expiry, or withdrawal | `active_marketing_leads`; `purge_expired_leads(3)` |
| Consent and withdrawal events | Prove the consent state and honor withdrawal; legal obligation and legitimate interests | 3 years from latest event, through the parent lead lifecycle | `consent_events` cascade; token rotation on withdrawal |
| Account identity, verified email, display name, last activity | Sign in and attach records to the right learner; service delivery | 2 years after last Academy activity; unresolved appeals and active staff responsibility pause deletion | `purge_inactive_users(2)` |
| Activation and course entitlement | Authorize Academy and course access; service delivery | Follows account lifecycle | Foreign-key cascade from `users` |
| Lesson progress, answers, simulation evidence | Resume learning and verify completion; service delivery and result integrity | Follows account lifecycle | Foreign-key cascade from `users` |
| Non-evidence exam attempts | Score attempts, detect replay, support disputes; service delivery and legitimate interests | 90 days after expiry | `purge_expired_attempts(90)` |
| Attempt used as passing evidence | Preserve the basis of the learner's recorded result | Follows learning/account lifecycle | Protected by `node_progress.passed_attempt_id` |
| Appeal case reference and status | Resolve a result appeal and hold relevant evidence; legitimate interests and legal claims | Until resolution; related attempt then resumes normal retention | `attempt_appeal`; purge hold in both attempt and account functions |
| Privacy-rights request evidence | Prove request receipt and disposition without storing the narrative in Academy; legal obligation and legitimate interests | 3 years after completion or denial; open cases are held | `privacy_request`; `purge_expired_privacy_requests(3)` |
| Staff-role assignment and authorization audit | Enforce and prove access changes; security and legitimate interests | Assignment and related history are held while that role is active; after revocation, assignment and audit history are deleted after 3 years | `purge_expired_staff_authorization_history(3)` |

## Processing boundaries

- Marketing senders must select recipients only from `academy.active_marketing_leads`.
- The unsubscribe URL carries a random recipient token in its fragment
  (`/unsubscribe#<token>`), never a query string. Fragments are not sent to the
  edge; the browser reads the token once, removes it from history, then posts it
  to the unsubscribe endpoint. It must not expose an email address.
- The public unsubscribe response is identical for valid, invalid, expired, and already-used tokens.
- Academy application code reaches personal data through server-side service functions. Browser clients receive no database credentials.
- The final processor names, processing locations, transfer grounds, and contracts remain a launch gate because production providers are not yet authorized.

## Automated deletion

The Cloudflare scheduled worker calls every registered purge function once per day. Each
function applies bounded batches and rejects invalid retention inputs. A failed RPC
rejects the scheduled job and must be investigated; it must not be converted into a
successful empty result.

Any legal hold added later must be represented in the database and excluded by the
purge functions before it is mentioned in the privacy notice.

Permanent purchase rights are not part of the current release. Before commerce is
enabled, a purchase ledger and entitlement-restore contract must be defined so account
retention cannot erase a paid right.
