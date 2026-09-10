---
name: playtest-academy
description: Compatibility entry point for Academy learner walkthroughs. Use for public or staging walkthroughs; route any canonical-production learner journey to academy-production-playtest.
---

# Playtest Academy

This name remains available for existing requests. It does not grant account,
email, enrollment, database, entitlement, lab, or cleanup authority.

## Route the request

1. Read `AGENTS.md` and identify the exact environment and journey.
2. For a public-only or staging journey, use a clean browser context, visible
   controls, one desktop and one mobile viewport, and record only sanitized
   route/state evidence. Exercise the requested route plus any observed failure,
   recovery, responsive, focus, and sign-out/exit state.
3. For canonical production, sign-in, Identity, canary creation, enrollment,
   entitlement, progress/attempt writes, Crux lab use, or cleanup, read and
   follow `skills/academy-production-playtest/SKILL.md`. Its authority,
   canary, browser-evidence, billable-lab, cleanup, retained-residue and PASS/
   BLOCKED rules are mandatory and are not abbreviated here.
4. If the target, mutation authority, controlled mailbox, provisioning path,
   cleanup owner, or recovery path is absent, return `BLOCKED` before mutation.

## Evidence and recheck

- Do not inspect source, answers, hidden APIs, browser storage, credentials,
  tokens, identity values, or learner identifiers to complete the walkthrough.
- Capture browser evidence only; allowlist the path/state/outcome needed for
  the claim and remove query strings and opaque identifiers.
- A local test, a callback, a cookie, a status code, or an un-interacted
  screenshot does not prove an authenticated learner journey.
- Recheck the changed route and each observed defect state after a fix. Broaden
  to adjacent routes only when the change shares auth, entitlement, progress,
  navigation, or responsive code.
- Report `PASS`, `FAIL`, or `BLOCKED`; name unrun checkpoints and any
  retained resource with its owner and disposition.