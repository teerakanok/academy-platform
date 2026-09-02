# Browser State Requires Allowlist Extraction

- Date: 2026-09-01; tightened 2026-09-02 after a checkout-state recurrence.
- Scope: Academy production playtests and provider-dashboard diagnostics.
- Root cause: A full browser accessibility tree was treated as ordinary UI text.
  During an authentication redirect it included a credential-bearing URL, and a
  later broad denylist still allowed unrelated account and network metadata into
  the tool transcript.
- Impact: No value was copied into a repository file, evidence artifact, user
  response, or external message. The inspection nevertheless violated the
  least-disclosure boundary because browser state itself can contain transient
  credentials and raw identifiers.
- Prevention control: `skills/playtest-academy/SKILL.md` now requires keeping full
  browser state inside the control runtime and emitting only an explicit allowlist
  of claim-required fields. Query strings, address-bar lines, headers, cookies,
  identity fields, location/network metadata, and opaque values are excluded.
  Billing evidence is further constrained to product, price, terms, selected
  add-on state, and payment-method presence as a boolean; card brand, masked
  digits, billing contact/address, tax identifiers, and payment labels are never
  emitted.
- Verification: Review the skill's Browser evidence safety checklist and confirm
  it requires allowlist extraction before output. A deterministic repository hook
  cannot intercept third-party browser-control transcripts, so the reusable skill
  checklist is the enforceable control at the action boundary.
- Canonical references: `skills/playtest-academy/SKILL.md`,
  `skills/playtest-academy/scripts/validate-playtest-record.mjs`.
