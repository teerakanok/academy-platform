-- 0016_consent_events_v2.sql -- version the complete bilingual consent display

alter table academy.leads
  drop constraint leads_consent_version_allowed;
alter table academy.leads
  add constraint leads_consent_version_allowed
  check (consent_text_version in ('v1', 'v2'));

create table academy.consent_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references academy.leads (id) on delete cascade,
  consent_at timestamptz not null,
  consent_text_version text not null
    constraint consent_events_version_allowed check (consent_text_version in ('v1', 'v2')),
  created_at timestamptz not null default now(),
  unique (lead_id, consent_text_version)
);

comment on table academy.consent_events is
  'Append-only consent history; one durable acknowledgement per lead and consent text version';

insert into academy.consent_events (lead_id, consent_at, consent_text_version)
select id, consent_at, consent_text_version
  from academy.leads
on conflict (lead_id, consent_text_version) do nothing;

alter table academy.consent_events enable row level security;
revoke all on academy.consent_events from service_role;
grant select, insert on academy.consent_events to service_role;

create or replace function academy.record_lead_consent(
  p_email text,
  p_consent_at timestamptz,
  p_consent_text_version text,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_referrer text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lead_id uuid;
begin
  insert into academy.leads (
    email,
    consent_at,
    consent_text_version,
    utm_source,
    utm_medium,
    utm_campaign,
    referrer
  ) values (
    p_email,
    p_consent_at,
    p_consent_text_version,
    p_utm_source,
    p_utm_medium,
    p_utm_campaign,
    p_referrer
  )
  on conflict (email) do update set email = excluded.email
  returning id into v_lead_id;

  insert into academy.consent_events (lead_id, consent_at, consent_text_version)
  values (v_lead_id, p_consent_at, p_consent_text_version)
  on conflict (lead_id, consent_text_version) do nothing;
end;
$$;

comment on function academy.record_lead_consent(text, timestamptz, text, text, text, text, text) is
  'Atomically create a lead if needed and retain one consent event for each text version';

revoke all on function academy.record_lead_consent(text, timestamptz, text, text, text, text, text) from public;
revoke all on function academy.record_lead_consent(text, timestamptz, text, text, text, text, text) from anon;
revoke all on function academy.record_lead_consent(text, timestamptz, text, text, text, text, text) from authenticated;
grant execute on function academy.record_lead_consent(text, timestamptz, text, text, text, text, text) to service_role;
