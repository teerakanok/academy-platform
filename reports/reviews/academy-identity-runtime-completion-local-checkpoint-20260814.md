# Academy Identity Runtime Completion - Local Checkpoint - 2026-08-14

**Status:** FINAL DIFFERENT-INDEPENDENT PASS `C0/H0/M0/L0`

**Authority:**
`reports/reviews/academy-identity-runtime-completion-freeze-20260814.json`

## Outcome

At Academy HEAD `ef7bdf21ec3b7ea6886ee14ae62dcf32bc3f75eb`, this
checkpoint adds one injected, production-disabled composition boundary for the
existing Identity callback completion ports. It composes the durable
transaction-store capability, verified code-exchange port, Academy profile
activation store, and Academy-owned session store in this exact order:

1. consume the one-time callback transaction;
2. create the client assertion and exchange the code;
3. verify the Identity-owned exchange result through the existing transaction
   boundary;
4. commit the Academy-owned profile activation; and
5. create an Academy session only after the activation commit succeeds.

The boundary accepts every runtime capability and admission flag from its
caller. It imports no registry, route, environment, database client, endpoint,
key, or Cloudflare runtime configuration.

## TDD And Verification

| Gate | Result |
|---|---|
| RED | Expected failure before collection: `runtime-completion` did not exist |
| Initial focused GREEN | `1` file / `5` tests PASS |
| Original different RIL | FAIL `C0/H0/M1/L0` |
| M-01 RED | `13` tests: `6` pass / `7` fail on activation/session projection mismatches |
| M-01 GREEN | `1` file / `13` tests PASS |
| Relevant Identity regression | `8` files / `111` tests PASS |
| TypeScript | `tsc --noEmit` PASS |
| Scoped ESLint | New source and test PASS |
| Different closure RIL | `133/133`, TypeScript, and scoped ESLint PASS; final `C0/H0/M0/L0` |
| UI and visual | N/A: no UI, copy, layout, or route implementation changed |
| Database and provider | N/A: injected fakes and local file stores only; no DB, network, or provider access |

The original RIL found that a structurally valid activation or session return
could diverge from the verified principal. M-01 remediation now binds the
activation commit to the verified issuer, subject, canonical email, status, and
revision, and accepts a session receipt only when its exact claims match that
commit. The focused seam also covers success ordering, exchange failure,
activation failure, session-create failure, one-time replay refusal, fresh-auth
recovery, disabled admission before capability reads, and unchanged production
route behavior (`404` authorization start and `503` callback with no session
cookie). Every completion failure exposes the same fixed generic error.

## Production Boundary

This module is not imported by a production route or registry. The accepted
consumer state remains `enabled=false`, `runtimeWired=false`, and
`releaseApproval=false`. Production still requires the seven canonical
conformance gaps, endpoint and key authority, approved runtime configuration,
Pool A migration/application evidence, deployed browser proof, and explicit
release authorization. This checkpoint does not enable, deploy, migrate, or
claim production readiness.

The final different-independent reviewer rebound the remediated authority,
reran `133/133` relevant tests plus TypeScript and scoped ESLint, and returned
`C0/H0/M0/L0`. The original M-01 chronology remains above; this closure changes
no runtime, release, or production flag.
