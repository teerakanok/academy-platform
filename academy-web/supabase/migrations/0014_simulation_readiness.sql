-- 0014_simulation_readiness.sql — validate simulation shape before consuming an attempt
--
-- The application needs the attempt snapshot to decide structural readiness, but reading it
-- must not claim the attempt. This RPC exposes the snapshot only to service_role and applies
-- the same owner/context/current-generation boundary as consume_attempt.

create or replace function academy.inspect_attempt(
  p_attempt_id uuid,
  p_user_id uuid,
  p_course_slug text,
  p_node_id text,
  p_challenge_id text
)
returns table (params jsonb, outcome jsonb)
language sql
security invoker
as $$
  select a.params, a.outcome
    from academy.attempt a
   where a.attempt_id = p_attempt_id
     and a.user_id = p_user_id
     and a.course_slug = p_course_slug
     and a.node_id = p_node_id
     and a.challenge_id = p_challenge_id
     and a.progress_epoch = coalesce((
       select e.epoch
         from academy.course_progress_epoch e
        where e.user_id = p_user_id and e.course_slug = p_course_slug
     ), 0)
     and (a.outcome is not null or a.expires_at > now());
$$;

comment on function academy.inspect_attempt is
  'อ่าน attempt snapshot เพื่อ pre-consume validation; ไม่ claim และรับเฉพาะ owner/context/generation ปัจจุบัน';

grant execute on function academy.inspect_attempt(uuid, uuid, text, text, text) to service_role;
revoke all on function academy.inspect_attempt(uuid, uuid, text, text, text)
  from public, anon, authenticated;
