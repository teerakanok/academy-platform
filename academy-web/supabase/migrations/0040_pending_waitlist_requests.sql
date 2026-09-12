create table academy.pending_waitlist_requests (
  email text primary key,
  requested_consent_text_version text not null
    constraint pending_waitlist_requests_version_allowed
    check (requested_consent_text_version in ('v1', 'v2', 'v3')),
  requested_at timestamptz not null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  referrer text,
  constraint pending_waitlist_requests_utm_source_length
    check (utm_source is null or char_length(utm_source) <= 200),
  constraint pending_waitlist_requests_utm_medium_length
    check (utm_medium is null or char_length(utm_medium) <= 200),
  constraint pending_waitlist_requests_utm_campaign_length
    check (utm_campaign is null or char_length(utm_campaign) <= 200),
  constraint pending_waitlist_requests_referrer_length
    check (referrer is null or char_length(referrer) <= 500),
  constraint pending_waitlist_requests_email_normalized
    check (
      email = lower(btrim(email))
      and char_length(email) between 3 and 320
      and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
);

create index pending_waitlist_requests_requested_at_idx
  on academy.pending_waitlist_requests (requested_at);

alter table academy.pending_waitlist_requests owner to postgres;
alter table academy.pending_waitlist_requests enable row level security;

revoke all on table academy.pending_waitlist_requests
  from public, anon, authenticated, service_role;
grant insert on academy.pending_waitlist_requests to academy_runtime;
grant delete on academy.pending_waitlist_requests to academy_retention_definer;
grant select (email, requested_at) on academy.pending_waitlist_requests
  to academy_retention_definer;

create or replace function academy.record_pending_waitlist_request(
  p_email text,
  p_requested_at timestamptz,
  p_requested_consent_text_version text,
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
  v_email text := lower(btrim(p_email));
begin
  if v_email is null
     or p_requested_at is null
     or p_requested_consent_text_version is null
     or p_requested_consent_text_version not in ('v1', 'v2', 'v3')
     or char_length(v_email) not between 3 and 320
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid pending waitlist request'
      using errcode = '22023';
  end if;

  insert into academy.pending_waitlist_requests (
    email,
    requested_consent_text_version,
    requested_at,
    utm_source,
    utm_medium,
    utm_campaign,
    referrer
  ) values (
    v_email,
    p_requested_consent_text_version,
    p_requested_at,
    p_utm_source,
    p_utm_medium,
    p_utm_campaign,
    p_referrer
  )
  on conflict do nothing;
end;
$$;

comment on function academy.record_pending_waitlist_request(text, timestamptz, text, text, text, text, text) is
  'Store an unconfirmed waitlist request without changing any marketing consent state';

revoke all on function academy.record_pending_waitlist_request(text, timestamptz, text, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function academy.record_pending_waitlist_request(text, timestamptz, text, text, text, text, text)
  to academy_runtime;

revoke execute on function academy.record_lead_consent(text, timestamptz, text, text, text, text, text)
  from academy_runtime;

create or replace function academy.purge_expired_leads(
  p_retain_years int default 3,
  p_limit int default 5000
)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_deleted integer := 0;
  v_pending_deleted integer := 0;
  v_lead_deleted integer := 0;
  v_remaining integer;
begin
  if p_retain_years < 1 or p_retain_years > 10 or p_limit < 1 or p_limit > 10000 then
    raise exception 'invalid lead retention bounds' using errcode = '22023';
  end if;

  with doomed_pending as (
    select email
      from academy.pending_waitlist_requests
     where requested_at < now() - make_interval(years => p_retain_years)
     order by requested_at
     limit p_limit
  )
  delete from academy.pending_waitlist_requests pending
   using doomed_pending doomed
   where pending.email = doomed.email
     and pending.requested_at < now() - make_interval(years => p_retain_years);

  get diagnostics v_pending_deleted = row_count;
  v_remaining := p_limit - v_pending_deleted;

  if v_remaining > 0 then
    with doomed as (
      select l.id
        from academy.leads l
       where coalesce(l.marketing_withdrawn_at, l.consent_at)
             < now() - make_interval(years => p_retain_years)
       order by coalesce(l.marketing_withdrawn_at, l.consent_at)
       limit v_remaining
    )
    delete from academy.leads l
     using doomed d
     where l.id = d.id
       and coalesce(l.marketing_withdrawn_at, l.consent_at)
           < now() - make_interval(years => p_retain_years);

    get diagnostics v_lead_deleted = row_count;
  end if;

  v_deleted := v_pending_deleted + v_lead_deleted;
  return v_deleted;
end;
$$;


