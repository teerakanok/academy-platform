-- Read only: prove current owner/context/epoch and reconcile any recorded outcome.
-- Never issue a new attempt, extend its expiry, expose answers, or transfer ownership.
create or replace function academy.inspect_attempt_reauthentication(
  p_attempt_id uuid, p_user_id uuid, p_course_slug text, p_node_id text
) returns text language sql security invoker set search_path = pg_catalog, academy as $$
  select coalesce((select case
      when a.outcome is not null then 'completed'
      when a.expires_at <= clock_timestamp() then 'invalid'
      when a.claim_token is not null and a.consumed_at >= clock_timestamp() - interval '30 seconds' then 'pending'
      else 'active' end
    from academy.attempt a
    where a.attempt_id=p_attempt_id and a.user_id=p_user_id
      and a.course_slug=p_course_slug and a.node_id=p_node_id and a.challenge_id='checkpoint'
      and a.progress_epoch=coalesce((select e.epoch from academy.course_progress_epoch e
        where e.user_id=p_user_id and e.course_slug=p_course_slug),0)), 'invalid')
$$;
revoke all on function academy.inspect_attempt_reauthentication(uuid,uuid,text,text) from public, anon, authenticated, service_role, academy_runtime;
grant execute on function academy.inspect_attempt_reauthentication(uuid,uuid,text,text) to academy_runtime;
