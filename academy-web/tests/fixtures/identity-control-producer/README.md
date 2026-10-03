# Identity Control producer snapshot

`client-assertion.ts` and `client-control.ts` are byte-identical copies of
`identity-control/packages/core/src/` at `05bc278` (last changed `72c920d`).
`index.ts` holds only the one type `client-assertion.ts` imports.

`load.ts` prefers a live producer: `ACADEMY_IDENTITY_CONTROL_ROOT`, then the
sibling `products/cyberskills/identity-control` checkout, then this snapshot.
The snapshot is digest-checked; when the producer changes either file, copy it
here and update `PINNED_SHA256` in `load.ts`.
