# Prevent raw Supabase status credentials in command output

- Date: 2026-08-04
- Scope: Academy local development and verification
- Root cause: `supabase status` was treated as harmless service-state output, but its
  default output also includes local API, JWT, database, and object-storage credentials.
  The command was run directly, so those values reached the tool transcript.
- Impact: The exposed values were local disposable development credentials, not Pool A
  or production credentials. Even so, printing credentials that are not needed violates
  least-disclosure practice and makes it easier to repeat the mistake with a sensitive
  environment.
- Prevention control: Use `academy-web/scripts/supabase-status-safe.sh`. It requests env
  format and replaces every value with presence and length evidence before stdout.
- Verification: The wrapper output must contain only `NAME=<set,len=N>` entries and a
  scan must find no JWT-shaped or PostgreSQL connection values.
- Canonical references: `skills/due-care/SKILL.md`,
  `academy-web/scripts/supabase-status-safe.sh`.
