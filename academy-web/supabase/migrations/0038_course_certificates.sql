-- Issued course-completion certificates (W4 of the approved certificate claim,
-- docs/certificate-claim.md). Issuance reads passing-attempt evidence, never
-- progress status alone; this table is the idempotent issued record with an
-- unpredictable public number and revocation state.
create table if not exists academy.course_certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references academy.users (id),
  course_slug text not null,
  course_version text not null,
  certificate_number text not null unique,
  evidence jsonb not null,
  issued_at timestamptz not null default statement_timestamp(),
  revoked_at timestamptz,
  constraint course_certificates_one_per_course unique (user_id, course_slug),
  constraint course_certificates_number_shape check (
    certificate_number ~ '^[0-9a-f]{32}$'
  ),
  constraint course_certificates_evidence_shape check (
    jsonb_typeof(evidence) = 'object'
  )
);

alter table academy.course_certificates owner to postgres;

alter table academy.course_certificates enable row level security;

-- Default deny: no policies. Only the server runtime reads/writes through its
-- own grants; browsers never touch this table directly.
revoke all on table academy.course_certificates
  from public, anon, authenticated, service_role;
grant select, insert on academy.course_certificates to academy_runtime;

create index course_certificates_user_idx
  on academy.course_certificates (user_id);
