# Academy Consumer Conformance Receipt Reconciliation

## Scope

This is a local, replayable consumer-conformance evidence repair. It does not
enable the registry, wire runtime behavior, send traffic, mutate production, or
grant release authority.

## Immutable Inputs

- Academy evidence commit: `36f8635429a4df7f29bcb2f0e5c1dc6eb02faf27`
- Academy direct parent and every scenario `sourceRevision`:
  `a6194e1f2534e71b336e3cb068e2229e469f06f8`
- Identity committed-wrapper revision:
  `57aec0a65df932b415b5b2a77a85689a6d9eee9a`

## Evidence Digests

- Report SHA-256: `c8dcb6dac0b56114fea3b53e6548e9ff9691e2c15c4fe5c725cfb62b918ba0eb`
- Rehearsal receipt SHA-256: `4025f2cabf2169e33f429bbf1c28c04c78e3768fb439915c937c7e864ae3f5a3`
- Committed-wrapper machine receipt SHA-256:
  `5b605fb38d59172c5c922ab02dfb1a0a08df038e4fe9675e3a6ab4c6872cf00a`

## Result

- The committed wrapper replayed the evidence commit from the exact parent and
  passed with `23/23` scenarios, `0` unproven, and source repository unchanged.
- The seven frozen scenario IDs remain unchanged.
- `localWorkingTreeReceipt.untrackedEntryCount` is `0`.
- `localWorkingTreeReceipt.untrackedStateSha256` is the empty manifest digest
  `64d07385b423b51c63e41b4e86bebe20ac3264d361739346c7d4dc5503186928`, and
  `untrackedFileSha256` is `[]`.
- Registry remains disabled; authority is `NONE`; traffic and production
  operations are `0`; release approval remains `false`.

## Verification

- `node --test academy-web/scripts/generate-identity-consumer-conformance-rehearsal.test.mjs`: PASS, `2/2`.
- `./node_modules/.bin/vitest run --project unit tests/unit/identity-runtime-browser-flow.test.ts`: PASS, `9/9`.
- Identity committed intake wrapper: PASS. Raw machine receipt:
  `reports/reviews/academy-consumer-conformance-committed-wrapper-receipt-20260824.json`.

## Residual Risk

The Identity CLI entrypoint at the pinned revision emits empty stdout when it
is spawned through the Academy generator, although its exported receipt API and
the committed wrapper both pass. This evidence uses the exported API only for
local artifact capture; no parser, contract, or wrapper behavior was weakened.
