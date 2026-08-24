# Academy Owner-Session Attestation Policy Checkpoint

The sole-operator contract now accepts only provenance
`owner_session_attestation_with_discord_reference` for Songpon. It pins guild
`1509152772635885608`, channel `1509154261504753775`, message
`1541330282169503824`, URL and derived timestamp
`2026-08-24T06:16:15.801Z`. The SHA-256 of the exact owner statement is
`628abfbe056c5dea5dbf21ac99afcc068afc4e527d062cb437c8395a7854999b`.

The contract explicitly records that Discord author/content was not
independently fetched and `remoteVerified` is false. The validator requires
full implementation and handoff revisions, proves implementation ancestry to
the handoff/evidence-root HEAD, and verifies exact source bytes and digests.
Changed provenance, URL components, timestamp, statement hash, remote flags,
revision ancestry, digest, backup, Araya, or two-ack semantics fail closed.

Focused and actual-root tests pass `40/40`; evaluator and lifecycle regressions
pass `20/20`. Counters remain `3/5`, `3/6`, `5/8`; authority is `NONE`, and
operations remain `0`. Sol review passed `C0/H0/M0`; visual review is N/A.
