# Academy Security Headers Local Checkpoint

**Date:** 2026-08-09
**Academy baseline:** `845e371173efb7b15b7605ecbc9496c47e2068fb`
**Status:** local implementation and author verification complete; final review pending

## Outcome

Academy now applies one catch-all HTTP security-header rule to pages and API
responses through `next.config.ts`. The checkpoint adds:

- a report-only Content Security Policy that declares self-hosted defaults,
  frame-ancestor and plugin restrictions for observation, and explicit
  script/style compatibility for the current Next.js application;
- one-year HSTS for the Academy host;
- MIME sniffing protection and active frame denial through
  `X-Frame-Options: DENY`;
- strict-origin referrer handling;
- disabled camera, geolocation, microphone, payment, and USB capabilities; and
- disabled DNS prefetching.

The CSP remains report-only so compatibility evidence can be collected before
an enforcement decision. It has no reporting endpoint and creates no new
network, credential, or operational dependency.

## Blocker And Dependency Map

| Lane | Verified remaining dependency | Current route |
|---|---|---|
| Identity-dependent | Runtime verification keys, lifecycle endpoint/audiences, kill-switch owner, release authorization, canonical owner bootstrap, entitled EN/TH browser proof | Identity Control release and separate production gate |
| Academy production-state | First retention cron event, deployed private-media/cookie/range proof, restricted-case ownership, Thai legal review, CNAME/public exposure and catalog authorization | Explicit production/owner evidence |
| Academy local-independent | Dependency advisories and CI audit gate; security-header local delivery and future CSP enforcement evidence | Continue in product-local checkpoints |

The security-header checkpoint was selected first because it closes a direct
application-layer control identified by the production audit without waiting
for Identity Control, a database, deployment, secrets, or an owner decision.

## TDD And Verification

The focused RED run failed all three tests because `nextConfig.headers` did not
exist. The final focused suite passed `3/3` and proves the catch-all route,
required header values, the exact ordered report-only CSP directive/source map,
duplicate rejection, rejection of unapproved wildcard/scheme/eval sources,
unique header names, and newline-free values.

| Gate | Result |
|---|---|
| Focused security-header suite | 3/3 passed |
| Full unit regression | 481/481 passed |
| `npm run lint` | Passed; one existing warning in `registry.generated.ts` |
| `npm run build` | Passed; 29 static pages generated |
| Local production server | Started temporarily on port `61009` and then stopped |
| `GET /courses` | `200`; all seven headers observed |
| `GET /api/auth/me` | `200`; all seven headers observed |

The temporary listener used the reserved test range and was removed after the
checks. The pre-existing PID `59647` on port `3003` was not used.

`npm audit --omit=dev --audit-level=low` still reports four High findings in the
installed transitive dependency tree: `nanoid`, Next-bundled `postcss`, and
`sharp`. This slice changes no dependency manifest or lockfile, so dependency
remediation remains a separate checkpoint.

## Remaining Gate

Before converting the CSP from report-only to enforced, Academy needs browser
compatibility evidence for the deployed topology, including public pages,
authenticated learner routes, private media, and any approved external media
provider. Production deployment and CSP enforcement were outside this local
checkpoint.

Final code/security and reader-first review remain with the root/final reviewer;
this report records author evidence only.
