# Academy privacy and appeal request runbook

Last reviewed: 2026-08-04

This is the operating path for requests received at `contact@cyberskills.co.th`.
Do not paste request narratives, identity documents, or mailbox contents into exam
attempt rows, application logs, issue trackers, or source control.

## Intake and identity

1. Assign a case reference in the approved restricted case system and create the minimal evidence row in `academy.privacy_request`.
2. Record request type, received time, subject email, status, and completion time. Keep the narrative, owner, and identity evidence only in the access-controlled case system.
3. For an account request, verify control of the Academy account or its verified email. For a waitlist-only request, require a reply from the subscribed address before disclosing data.
4. Never send personal data merely because a requester knows an email address, course, or attempt time.

The database evidence row is default-deny and is deleted three years after a case is
completed or denied. The separate restricted case system remains an operational launch
dependency: its location, access control, retention, and owner must be configured before
handling requests other than unsubscribe in production.

## Marketing withdrawal

- Recipient links use `/unsubscribe#<opaque-token>`; the browser posts the token
  to `POST /api/leads/unsubscribe` without putting it in the initial request URL.
- A verified email request is processed with `withdraw_marketing_consent_by_email`.
- Withdrawal takes effect immediately for future selections. Never export recipients directly from `leads`; use `active_marketing_leads`.
- Do not disclose whether an address was subscribed. Confirm only that the request has been applied where applicable.
- Withdrawal does not delete or change the Academy account, entitlement, or learning record.

## Result appeal

1. Accept an appeal received no later than 30 days after `result_recorded_at`.
2. Verify the account, course, and approximate attempt time, then call `open_attempt_appeal` with the case reference.
3. If the function returns no appeal ID, do not invent a case link; verify ownership and the filing window.
4. Keep the case open while reviewing. The database automatically holds the attempt and account from retention deletion.
5. Send the outcome, then call `resolve_attempt_appeal`. The normal 90-day attempt retention resumes after resolution.

## Other privacy rights

- Log and verify access, copy, correction, deletion, restriction, objection, portability, and consent-withdrawal requests before action.
- Provide access or a copy without delay and within 30 days where the request is valid and no legal exception applies.
- Before deletion or correction, map the subject across account, learning, entitlement, waitlist, consent, appeal, and case records. Preserve only records subject to a documented legal hold.
- Escalate identity conflicts, third-party data, active disputes, or uncertain legal grounds before disclosure or deletion.

## Daily retention check

The scheduled worker must complete all five jobs: attempt 90 days, waitlist 3 years,
inactive accounts 2 years, completed privacy-request evidence 3 years, and revoked
staff-role/audit history 3 years. It attempts
every job even when one fails, then reports the combined failure. Investigate each failed
RPC and rerun only after the cause is understood. Never bypass hold predicates with
direct bulk deletion.

The procedures in this runbook are backend operations, not proof that the reserved
`privacy-officer` role has a usable operator workflow. Do not expose these operations in
a staff surface until that surface enforces `privacy-officer` or `owner` on every request.
