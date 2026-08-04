-- 0017_privacy_retention_and_appeals.sql -- enforce the founder-approved
-- marketing, attempt-retention, appeal, and unsubscribe contracts.

-- ── Marketing consent lifecycle ──────────────────────────────────────────────

alter table academy.leads
  drop constraint leads_consent_version_allowed;
alter table academy.leads
  add constraint leads_consent_version_allowed
  check (consent_text_version in ('v1', 'v2', 'v3'));

alter table academy.consent_events
  drop constraint consent_events_version_allowed;
alter table academy.consent_events
  add constraint consent_events_version_allowed
  check (consent_text_version in ('v1', 'v2', 'v3'));

alter table academy.leads
  add column marketing_consent_expires_at timestamptz,
  add column marketing_withdrawn_at timestamptz,
  add column unsubscribe_token uuid not null default gen_random_uuid();

update academy.leads
   set marketing_consent_expires_at = consent_at + interval '3 years';

alter table academy.leads
  alter column marketing_consent_expires_at set not null,
  alter column marketing_consent_expires_at set default (now() + interval '3 years'),
  add constraint leads_marketing_dates_valid
    check (marketing_consent_expires_at > consent_at
      and (marketing_withdrawn_at is null or marketing_withdrawn_at >= consent_at));

create unique index leads_unsubscribe_token_unique
  on academy.leads (unsubscribe_token);
create index leads_retention_idx
  on academy.leads ((coalesce(marketing_withdrawn_at, consent_at)));

alter table academy.consent_events
  drop constraint if exists consent_events_lead_id_consent_text_version_key,
  add column event_type text not null default 'granted',
  add column source text not null default 'waitlist',
  add constraint consent_events_type_allowed
    check (event_type in ('granted', 'withdrawn')),
  add constraint consent_events_source_allowed
    check (source in ('waitlist', 'unsubscribe-link', 'email-request'));

comment on table academy.consent_events is
  'Append-only marketing consent history: grants, re-grants, and withdrawals with the text version and source';

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
  v_lead academy.leads%rowtype;
begin
  insert into academy.leads (
    email,
    consent_at,
    consent_text_version,
    marketing_consent_expires_at,
    utm_source,
    utm_medium,
    utm_campaign,
    referrer
  ) values (
    p_email,
    p_consent_at,
    p_consent_text_version,
    p_consent_at + interval '3 years',
    p_utm_source,
    p_utm_medium,
    p_utm_campaign,
    p_referrer
  )
  on conflict (email) do nothing
  returning * into v_lead;

  if found then
    insert into academy.consent_events
      (lead_id, consent_at, consent_text_version, event_type, source)
    values
      (v_lead.id, p_consent_at, p_consent_text_version, 'granted', 'waitlist');
    return;
  end if;

  select * into strict v_lead
    from academy.leads
   where email = p_email
   for update;

  -- An active grant with the same text is an idempotent retry. A withdrawn,
  -- expired, or newly-versioned grant is a real state transition and receives
  -- a new append-only event plus a fresh unsubscribe bearer token.
  if v_lead.marketing_withdrawn_at is null
     and v_lead.marketing_consent_expires_at > p_consent_at
     and v_lead.consent_text_version = p_consent_text_version then
    -- A public email-only form cannot prove that a repeat submission came from
    -- the address owner. Do not let a third party silently extend active consent.
    return;
  end if;

  update academy.leads
     set consent_at = p_consent_at,
         consent_text_version = p_consent_text_version,
         marketing_consent_expires_at = p_consent_at + interval '3 years',
         marketing_withdrawn_at = null,
         unsubscribe_token = gen_random_uuid(),
         utm_source = p_utm_source,
         utm_medium = p_utm_medium,
         utm_campaign = p_utm_campaign,
         referrer = p_referrer
   where id = v_lead.id;

  insert into academy.consent_events
    (lead_id, consent_at, consent_text_version, event_type, source)
  values
    (v_lead.id, p_consent_at, p_consent_text_version, 'granted', 'waitlist');
end;
$$;

create or replace function academy.withdraw_marketing_consent(
  p_unsubscribe_token uuid,
  p_withdrawn_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lead academy.leads%rowtype;
begin
  select * into v_lead
    from academy.leads
   where unsubscribe_token = p_unsubscribe_token
   for update;

  if not found or v_lead.marketing_withdrawn_at is not null then
    return false;
  end if;

  update academy.leads
     set marketing_withdrawn_at = p_withdrawn_at,
         unsubscribe_token = gen_random_uuid()
   where id = v_lead.id;

  insert into academy.consent_events
    (lead_id, consent_at, consent_text_version, event_type, source)
  values
    (v_lead.id, p_withdrawn_at, v_lead.consent_text_version, 'withdrawn', 'unsubscribe-link');
  return true;
end;
$$;

create or replace function academy.withdraw_marketing_consent_by_email(
  p_email text,
  p_withdrawn_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lead academy.leads%rowtype;
begin
  select * into v_lead
    from academy.leads
   where email = lower(btrim(p_email))
   for update;

  if not found or v_lead.marketing_withdrawn_at is not null then
    return false;
  end if;

  update academy.leads
     set marketing_withdrawn_at = p_withdrawn_at,
         unsubscribe_token = gen_random_uuid()
   where id = v_lead.id;

  insert into academy.consent_events
    (lead_id, consent_at, consent_text_version, event_type, source)
  values
    (v_lead.id, p_withdrawn_at, v_lead.consent_text_version, 'withdrawn', 'email-request');
  return true;
end;
$$;

create or replace view academy.active_marketing_leads
with (security_invoker = true)
as
select id, email, unsubscribe_token, consent_at, consent_text_version
  from academy.leads
 where marketing_withdrawn_at is null
   and marketing_consent_expires_at > now();

revoke all on academy.active_marketing_leads from public, anon, authenticated;
grant select on academy.active_marketing_leads to service_role;

create or replace function academy.purge_expired_leads(
  p_retain_years int default 3,
  p_limit int default 5000
)
returns integer
language plpgsql
security invoker
as $$
declare
  v_deleted integer;
begin
  if p_retain_years < 1 or p_retain_years > 10 or p_limit < 1 or p_limit > 10000 then
    raise exception 'invalid lead retention bounds' using errcode = '22023';
  end if;

  with doomed as (
    select l.id
      from academy.leads l
     where coalesce(l.marketing_withdrawn_at, l.consent_at)
           < now() - make_interval(years => p_retain_years)
     order by coalesce(l.marketing_withdrawn_at, l.consent_at)
     limit p_limit
  )
  delete from academy.leads l
   using doomed d
   where l.id = d.id
     and coalesce(l.marketing_withdrawn_at, l.consent_at)
         < now() - make_interval(years => p_retain_years);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- ── Attempt results, appeal window, and retention holds ──────────────────────

alter table academy.attempt
  add column result_recorded_at timestamptz;

update academy.attempt
   set result_recorded_at = consumed_at
 where outcome is not null;

alter table academy.attempt
  add constraint attempt_result_timestamp_consistent
    check ((outcome is null and result_recorded_at is null)
      or (outcome is not null and result_recorded_at is not null));

create or replace function academy.stamp_attempt_result()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.outcome is null and new.outcome is not null then
    new.result_recorded_at := coalesce(new.result_recorded_at, now());
  end if;
  return new;
end;
$$;

create trigger attempt_result_timestamp
before update of outcome on academy.attempt
for each row execute function academy.stamp_attempt_result();

create table academy.attempt_appeal (
  appeal_id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references academy.attempt (attempt_id) on delete cascade,
  user_id uuid not null references academy.users (id) on delete cascade,
  case_reference text not null
    constraint attempt_appeal_reference_length check (char_length(btrim(case_reference)) between 1 and 120),
  filed_at timestamptz not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint attempt_appeal_resolution_valid check (resolved_at is null or resolved_at >= filed_at)
);

create unique index attempt_appeal_reference_unique
  on academy.attempt_appeal (case_reference);
create unique index attempt_appeal_one_open_per_attempt
  on academy.attempt_appeal (attempt_id)
  where resolved_at is null;
create index attempt_appeal_open_lookup
  on academy.attempt_appeal (attempt_id, filed_at)
  where resolved_at is null;

alter table academy.attempt_appeal enable row level security;
revoke all on academy.attempt_appeal from service_role;
grant select, insert, update on academy.attempt_appeal to service_role;

create or replace function academy.open_attempt_appeal(
  p_attempt_id uuid,
  p_user_id uuid,
  p_case_reference text,
  p_filed_at timestamptz default now()
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_result_at timestamptz;
  v_appeal_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_attempt_id::text, 0));

  select a.result_recorded_at into v_result_at
    from academy.attempt a
   where a.attempt_id = p_attempt_id and a.user_id = p_user_id
   for share;

  if v_result_at is null
     or p_filed_at < v_result_at
     or p_filed_at > v_result_at + interval '30 days' then
    return null;
  end if;

  select appeal_id into v_appeal_id
    from academy.attempt_appeal
   where attempt_id = p_attempt_id and resolved_at is null;
  if found then
    return v_appeal_id;
  end if;

  insert into academy.attempt_appeal
    (attempt_id, user_id, case_reference, filed_at)
  values
    (p_attempt_id, p_user_id, btrim(p_case_reference), p_filed_at)
  returning appeal_id into v_appeal_id;
  return v_appeal_id;
end;
$$;

create or replace function academy.resolve_attempt_appeal(
  p_case_reference text,
  p_resolved_at timestamptz default now()
)
returns boolean
language plpgsql
security invoker
as $$
declare
  v_updated integer;
begin
  update academy.attempt_appeal
     set resolved_at = p_resolved_at
   where case_reference = btrim(p_case_reference)
     and resolved_at is null
     and p_resolved_at >= filed_at;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function academy.purge_expired_attempts(
  p_retain_days int default 90,
  p_limit int default 5000
)
returns integer
language plpgsql
security invoker
as $$
declare
  v_deleted integer;
begin
  if p_retain_days < 30 or p_retain_days > 3650 or p_limit < 1 or p_limit > 10000 then
    raise exception 'invalid attempt retention bounds' using errcode = '22023';
  end if;

  with doomed as (
    select a.attempt_id
      from academy.attempt a
     where coalesce(a.result_recorded_at, a.expires_at) < now() - make_interval(days => p_retain_days)
       and not exists (
         select 1
           from academy.node_progress np
          where np.passed_attempt_id = a.attempt_id
       )
       and not exists (
         select 1
           from academy.attempt_appeal ap
          where ap.attempt_id = a.attempt_id and ap.resolved_at is null
       )
     order by coalesce(a.result_recorded_at, a.expires_at)
     limit p_limit
  )
  delete from academy.attempt a
   using doomed d
   where a.attempt_id = d.attempt_id
     and coalesce(a.result_recorded_at, a.expires_at) < now() - make_interval(days => p_retain_days)
     and not exists (
       select 1 from academy.node_progress np where np.passed_attempt_id = a.attempt_id
     )
     and not exists (
       select 1 from academy.attempt_appeal ap
        where ap.attempt_id = a.attempt_id and ap.resolved_at is null
     );

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

create index attempt_retention_anchor_idx
  on academy.attempt ((coalesce(result_recorded_at, expires_at)));

comment on function academy.purge_expired_attempts is
  'Delete non-evidence attempts 90 days after result, or after expiry when unfinished; an unresolved appeal holds deletion';

create index users_retention_idx on academy.users (last_seen_at);

create or replace function academy.purge_inactive_users(
  p_inactive_years int default 2,
  p_limit int default 500
)
returns integer
language plpgsql
security invoker
as $$
declare
  v_deleted integer;
begin
  if p_inactive_years < 1 or p_inactive_years > 10 or p_limit < 1 or p_limit > 10000 then
    raise exception 'invalid account retention bounds' using errcode = '22023';
  end if;

  with doomed as (
    select u.id
      from academy.users u
     where u.last_seen_at < now() - make_interval(years => p_inactive_years)
       and not exists (
         select 1
           from academy.attempt_appeal ap
          where ap.user_id = u.id and ap.resolved_at is null
       )
     order by u.last_seen_at
     limit p_limit
  )
  delete from academy.users u
   using doomed d
   where u.id = d.id
     and u.last_seen_at < now() - make_interval(years => p_inactive_years)
     and not exists (
       select 1 from academy.attempt_appeal ap
        where ap.user_id = u.id and ap.resolved_at is null
     );

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on function academy.purge_inactive_users is
  'Delete Academy accounts and cascading learning records after two years without activity; unresolved appeals hold the account';

-- Restricted operational evidence for privacy-rights requests. No request narrative
-- or identity document belongs here; the case reference points to the approved case system.
create table academy.privacy_request (
  request_id uuid primary key default gen_random_uuid(),
  case_reference text not null unique
    constraint privacy_request_reference_length check (char_length(btrim(case_reference)) between 1 and 120),
  subject_email text not null
    constraint privacy_request_email_normalized check (subject_email = lower(btrim(subject_email))),
  request_type text not null
    constraint privacy_request_type_allowed check (
      request_type in ('access', 'copy', 'correction', 'deletion', 'restriction', 'objection', 'portability', 'withdrawal')
    ),
  status text not null default 'open'
    constraint privacy_request_status_allowed check (status in ('open', 'completed', 'denied')),
  received_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint privacy_request_completion_valid check (
    (status = 'open' and completed_at is null)
    or (status in ('completed', 'denied') and completed_at is not null and completed_at >= received_at)
  )
);

create index privacy_request_retention_idx on academy.privacy_request (completed_at) where completed_at is not null;
alter table academy.privacy_request enable row level security;
revoke all on academy.privacy_request from service_role;
grant select, insert, update, delete on academy.privacy_request to service_role;

create or replace function academy.purge_expired_privacy_requests(
  p_retain_years int default 3,
  p_limit int default 500
)
returns integer
language plpgsql
security invoker
as $$
declare
  v_deleted integer;
begin
  if p_retain_years < 1 or p_retain_years > 10 or p_limit < 1 or p_limit > 10000 then
    raise exception 'invalid privacy request retention bounds' using errcode = '22023';
  end if;
  with doomed as (
    select request_id from academy.privacy_request
     where completed_at < now() - make_interval(years => p_retain_years)
     order by completed_at limit p_limit
  )
  delete from academy.privacy_request r using doomed d
   where r.request_id = d.request_id
     and r.completed_at < now() - make_interval(years => p_retain_years);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function academy.record_lead_consent(text, timestamptz, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function academy.record_lead_consent(text, timestamptz, text, text, text, text, text)
  to service_role;
revoke all on function academy.withdraw_marketing_consent(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function academy.withdraw_marketing_consent(uuid, timestamptz)
  to service_role;
revoke all on function academy.withdraw_marketing_consent_by_email(text, timestamptz)
  from public, anon, authenticated;
grant execute on function academy.withdraw_marketing_consent_by_email(text, timestamptz)
  to service_role;
revoke all on function academy.purge_expired_leads(int, int)
  from public, anon, authenticated;
grant execute on function academy.purge_expired_leads(int, int)
  to service_role;
revoke all on function academy.open_attempt_appeal(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function academy.open_attempt_appeal(uuid, uuid, text, timestamptz)
  to service_role;
revoke all on function academy.resolve_attempt_appeal(text, timestamptz)
  from public, anon, authenticated;
grant execute on function academy.resolve_attempt_appeal(text, timestamptz)
  to service_role;
revoke all on function academy.purge_expired_attempts(int, int)
  from public, anon, authenticated;
grant execute on function academy.purge_expired_attempts(int, int)
  to service_role;
revoke all on function academy.purge_inactive_users(int, int)
  from public, anon, authenticated;
grant execute on function academy.purge_inactive_users(int, int)
  to service_role;
revoke all on function academy.purge_expired_privacy_requests(int, int)
  from public, anon, authenticated;
grant execute on function academy.purge_expired_privacy_requests(int, int)
  to service_role;
