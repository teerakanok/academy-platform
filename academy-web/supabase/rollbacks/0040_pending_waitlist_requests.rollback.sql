-- Emergency rollback is intentionally intake-disabled and data-preserving.
-- Pending rows and their retention evidence remain available for review; only
-- a future reviewed migration may remove them. Do not restore the granting RPC.
revoke all on table academy.pending_waitlist_requests
  from public, anon, authenticated, service_role,
    academy_runtime, academy_retention_definer;
revoke all on function academy.record_pending_waitlist_request(
  text, timestamptz, text, text, text, text, text
)
  from public, anon, authenticated, service_role, academy_runtime;

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


