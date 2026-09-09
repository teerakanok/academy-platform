# SEC-ACADEMY-017 source-freeze rebind R4

This record supersedes the terminal-freeze claim in
`academy-learning-quota-review-freeze-r3.json`; it does not replace that file
or the original independent review. Both remain immutable historical evidence.

## Observed drift

At source `3f08bc0a47793c44eaf6c5e97dd6f7234a3bca68`, the R3 manifest's 12
implementation, test, harness, configuration, and quota-documentation paths
match their listed SHA-256 digests. Its thirteenth path,
`reports/security/2026-09-05-security-review-checklist.md`, does not:

- R3 listed digest: `053691e84bac0c1564d6ad7e8d02bc783d9a1c1b18bc3eea02f573f88a96e9e6`
- observed digest: `610eae115b2c5970aa9c3b70744fabbb329100c030b773229c9d683870f6b4f4`

Relative to the R3-reviewed source bytes, the only observed freeze drift is
that checklist's status and evidence prose for SEC-ACADEMY-017 (and adjacent
status context). The 12 implementation-bound paths retain their R3-listed
bytes. The prior statement that R3 was `13/13` is therefore not reproducible
at the committed source and must not be reused.

## Superseding source manifest

`academy-learning-quota-source-freeze-r4.json` is a canonical
`checkpoint-freeze-manifest.v1` generated from exactly the 12 unchanged,
implementation-bound paths. It intentionally excludes the checklist and both
freeze/rebind records. That avoids self-pinning and distinguishes the code/test
checkpoint from mutable status prose.

The base/source relationship remains:

- base: `31c44d07b25a8100548c16eb7314b3b881d809b2`
- source: `3f08bc0a47793c44eaf6c5e97dd6f7234a3bca68`
- original R3 manifest SHA-256: `1a64acbf17c0cf3c35be8bd13a10e5c129295220d52674e77a9242997bead1fb`

## Review boundary

The original R2 review covers the SEC-ACADEMY-017 source behavior and the two
then-closed findings, and records no deployment, authenticated production
quota exercise, or live learner journey. It did not review this R4 rebind, and
this record does not claim a fresh independent review or extend the original
coverage to the changed checklist prose. Parent independent review is required
before the superseding record can support a terminal evidence claim.

No source implementation, test, build, deployment, credential, database,
browser, or live-system action was performed for this rebind.
