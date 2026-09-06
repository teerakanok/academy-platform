# Identity lifecycle pull runtime

## Boundary

Academy consumes account lifecycle by authenticated pull. It exposes no inbound
lifecycle webhook and never accepts lifecycle state from a browser session.
The canonical producer snapshot is Identity Control `ab958ee`; its approved
registry still leaves the private publisher endpoint, client-assertion
audience, event audience, and verification keys unpublished. This deployment
therefore remains disabled until those exact values are provisioned and released.
Do not substitute a guessed endpoint, audience, issuer, key, or digest.

The named kill-switch operator is Songpon
<songpon@cyberskills.co.th>. A missing `IDENTITY_LIFECYCLE_ENABLED` value keeps
the scheduler inert. Setting it to `true` without every other exact producer
value fails closed and visibly; dependency and signer initialization failures
surface only a sanitized error.

## Composition

The main Cloudflare Worker runs the pull every five minutes. The runtime:

1. parses the complete non-secret runtime configuration and the pinned active
   producer verification-key snapshot;
2. signs a short-lived ES256 client assertion bound to `purpose=lifecycle_pull`,
   `consumerId=academy-web`, and the exact pull audience;
3. performs one bounded no-store POST through the strict JSON response reader;
4. verifies every compact lifecycle envelope for issuer, audience, key, lifetime,
   signature, event shape, and producer cursor relationships;
5. claims the database-clock singleton lease;
6. commits the complete page and cursor through the reviewed fenced RPC; and
7. releases the lease with a primary committed/retry result.

Before claiming the lease, the runtime presents the source-reviewed
`configRevision` from the Academy consumer-policy mirror to a dedicated
reconciliation RPC. The RPC is granted only to `academy_runtime`; it changes
state only when that revision is the monotonic successor already observed from
a verified producer page. The current revision is an idempotent no-op, while an
unobserved or regressing revision fails closed. Updating this source-pinned
value requires the normal producer-contract review and Academy release.

The durable principal issuer is exactly
`https://supabase.cyberskills.co.th/auth/v1`. Revision, replay, gap, conflict,
and configuration changes are adjudicated by the existing verified reducer and
page-store contract before any authorization effect is applied.

## Authorization effects

Migration `0032` is surgical and is not executed by this repository. It adds an
index on `(issuer, subject_key, id)` and changes only the leased commit and
callback activation paths:

- `disabled` maps to `suspended`, updates activation monotonically, and deletes
  all indexed sessions for that principal;
- `deleted` deactivates and removes the Academy profile after principal session
  revocation while migration `0031` detached entitlement audit attribution
  remains preserved;
- `active` can restore service activation only through a newer ready projection
  under the approved producer config revision and never recreates a profile by
  itself;
- an unapproved config revision withholds `active` effects while applying
  `disabled` and `deleted` revocations immediately;
- callback activation and session issuance also require checkpoint
  configuration health `ready`, so an active projection from an unapproved
  page cannot bypass the withheld effect;
- once the observed successor is explicitly approved, reconciliation marks the
  checkpoint ready and applies its withheld ready projections atomically;
- gap and conflict projections apply no sensitive effect;
- callback provisioning and lifecycle commits share a transaction-scoped
  advisory principal lock, so a deleted projection cannot race a stale callback
  back into an account; and
- session insertion takes that same lock and rechecks the durable profile,
  activation, and lifecycle projection, so deletion between profile activation
  and session issuance cannot leave a stale session; and
- session creation takes the principal lock before expired-session cleanup,
  preserving the lifecycle lock order and preventing a revoke/cleanup deadlock;
- request paths call a read-only active-account resolver and display the durable
  profile email, never claims frozen in an older opaque session.

Manual course entitlement remains an Academy operator decision. Identity
lifecycle carries no product entitlement, staff role, or resource authority.

## Local verification boundary

The disposable PostgreSQL harness is ownership- and digest-pinned and never
pulls an image. It verifies the forward migration inside `ROLLBACK` before
`COMMIT`, including concurrent lifecycle/session behavior. Migration `0032` has
no automated downgrade because the prior callback behavior can resurrect erased
profiles; its rollback aborts before changing any object. No live database,
migration, mail provider, deployment, secret, or production endpoint operation
is authorized by this document.
