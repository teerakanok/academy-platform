# Academy Identity Session Cookie Local Checkpoint

**Date:** 2026-08-09
**Academy baseline:** `845e371173efb7b15b7605ecbc9496c47e2068fb`
**Status:** local implementation and author verification complete; independent review pending

## Outcome

The future `academy_session` boundary now reads the raw `Cookie` header and
returns an opaque session ID only when the exact case-sensitive canonical name
occurs once. A missing, malformed, too-short, too-long, or duplicate canonical
cookie returns `null`; duplicate rejection does not depend on which value comes
first.

The accepted value is restricted to the existing URL-safe opaque alphabet and
inclusive length range of 32-160 characters. Creation and deletion share one
deterministic host-only attribute policy: `Path=/`, `HttpOnly`, `SameSite=Lax`,
and matching `Secure` behavior. Deletion uses `Max-Age=0`; neither serializer
emits a parent `Domain` attribute.

## TDD And Verification

The focused RED run failed four new cases because the parser and deletion
serializer did not exist. After the narrow implementation, the focused suite
passed `6/6` and the full unit suite passed `484/484` across 73 files.

| Gate | Result |
|---|---|
| Focused identity-session store suite | 6/6 passed |
| Full unit regression | 484/484 passed |
| `npm run lint` | Passed; one existing warning in `registry.generated.ts` |
| `npm run build` | Passed; 29 static pages generated |
| `npm audit --omit=dev --audit-level=low` | Four existing High transitive findings |

The dependency findings remain in `nanoid`, Next-bundled `postcss`, and `sharp`.
This checkpoint changes no dependency manifest or lockfile.

## Runtime Boundary

This is a unit-only, local library boundary. The parser and deletion serializer
are not imported by Academy auth/session routes, middleware, or legacy Supabase
runtime code. The checkpoint does not enable Identity Control, create a session,
change a database, configure a parent-domain cookie, or alter deployed traffic.

Production readiness still requires browser evidence for the final HTTPS
topology: one canonical host-only cookie, duplicate-name failure behavior,
matching deletion on sign-out/expiry/revocation, refresh behavior, and absence
from sibling hosts. Runtime wiring and that proof require a separate authorized
checkpoint.

Final code/security review remains with the independent reviewer; this report
records author evidence only.
