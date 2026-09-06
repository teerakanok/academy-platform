create or replace function academy.identity_session_id_digest(p_session_id text)
returns text
language sql
immutable
strict
parallel safe
set search_path = pg_catalog
as $$
  select rtrim(
    translate(
      encode(sha256(convert_to(p_session_id, 'UTF8')), 'base64'),
      '+/',
      '-_'
    ),
    '='
  )
$$;

revoke all on function academy.identity_session_id_digest(text)
  from public, anon, authenticated, service_role, academy_runtime;

do $$
declare
  v_digest_collisions bigint;
begin
  select count(*) into v_digest_collisions
  from (
    select academy.identity_session_id_digest(id) as digest
    from academy.identity_session
    group by academy.identity_session_id_digest(id)
    having count(*) > 1
  ) as collisions;

  if v_digest_collisions > 0 then
    raise exception 'identity session digest transition would collide'
      using errcode = '23514';
  end if;
end
$$;

update academy.identity_session
   set id = academy.identity_session_id_digest(id);

update academy.identity_authorization_transaction
   set session_id = case
     when completed_at is null then null
     else academy.identity_session_id_digest(session_id)
   end
 where session_id is not null;

comment on column academy.identity_session.id is
  'SHA-256 base64url digest of the browser-held opaque Academy session bearer';
comment on column academy.identity_authorization_transaction.session_id is
  'SHA-256 base64url digest matching identity_session.id; null lets an old in-flight claim re-derive a stable bearer';
