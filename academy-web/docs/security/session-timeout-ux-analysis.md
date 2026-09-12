# Session timeout and reauthentication analysis — candidate only

Parent policy direction: 12-hour absolute lifetime and 30-minute inactivity window.
No idle migration or assurance-v2 wire change is implemented by this document.
Migration 0042 is reserved for the separate certificate erasure decision; allocate a
later migration for approved session/assurance changes.

Current production store defaults to 24 hours (`postgres-session-store.ts`) and
permits a 30-day input ceiling; no idle timestamp exists. Session reads already use
principal/session locking and authoritative lifecycle checks in 0041. The candidate
must enforce both new limits with database time, update `last_seen_at` only after all
successful checks, never extend absolute expiry, and never refresh an expired row.
New sessions start at their actual creation time. Backfill cannot claim historical
activity from migration time; either conservatively use recorded creation/known
activity or require reauthentication. Assurance `auth_time` is separate from both
`created_at` and `last_seen_at` and never changes on ordinary activity.

Current failure UX needs correction before enabling idle expiry:

- `progress-client.ts` distinguishes 401/403 on GET, but POST merges them into
  `accessLost`; `LessonView.tsx` then shows entitlement-loss copy instead of expired
  session recovery. Attempt issuance similarly merges lost authorization outcomes.
- The lesson access-loss branch unmounts the quiz. Its memory draft survives only
  in this tab; following the existing same-tab sign-in link destroys it on navigation.
  Do not restore persistent browser answer storage to solve this.
- Attempts expire after 60 minutes. Reauthentication must not extend an assessment
  attempt or reuse answers against newly randomized questions. Committed progress
  must be reloaded before retrying a response whose commit status was uncertain.
- `InteractiveVideo.tsx` has play/pause/time state and error retry but no explicit
  session inactivity signal. A single long buffered response may provide no further
  server requests during active playback; media range requests alone cannot guarantee
  that a viewer remains active under a 30-minute policy.

Proposed bounded UX: distinguish expired/unauthenticated 401 from forbidden 403 and
unavailable 503, mask private lesson content while retaining the current draft only
in tab memory, and offer an explicit sign-in link in a separate tab with noopener.
On return, require a user-triggered authenticated retry. Restore a draft only after
the server confirms current course/resource access and returns the same still-valid
owned attempt; a different/expired attempt clears the old draft and explains that a
fresh task is required. Email equality or a BroadcastChannel message must not be an
identity authority. Successful reauthentication must revoke the prior durable session
under the reviewed session replacement contract, without breaking concurrent callback
idempotency. No background retry automatically submits a previously unconfirmed quiz.

If active foreground playback is accepted as activity, use a bounded same-origin
authenticated activity endpoint only while the document is visible and the player
is actually playing, at most once per minute, with existing authoritative session
validation, CSRF and actor/global rate limits. Pause/hidden documents stop activity;
the endpoint never renews absolute expiry or revives idle sessions. This is a declared
application activity policy, not proof of physical human presence. Parent must settle
this policy and endpoint scope before implementation; no unconditional background
keepalive should silently defeat inactivity expiry.

Acceptance must cover exact idle/absolute boundaries and concurrency in real isolated
PostgreSQL; invalid/disabled/deleted reads do not touch activity; old token denied after
reauth; legacy backfill; 31-minute active playback versus paused/hidden playback;
quiz/simulation answers preserved through same-account reauth but cleared for changed
account or attempt; expired attempt handling; uncertain commit reconciliation; unchanged
server-recorded progress; and live producer/consumer composition. Existing source-only
ASVS7.2.4,7.3.1,7.3.2 and assurance controls stay OPEN until these gates pass.

