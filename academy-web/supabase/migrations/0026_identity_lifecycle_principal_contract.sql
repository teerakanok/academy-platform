-- Align the Academy durable lifecycle principal boundary with the pinned
-- Identity Control producer contract. This migration adds no runtime wiring.

create or replace function academy.identity_lifecycle_issuer_is_canonical(
  p_value text
) returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $function$
  select p_value is not null
    and length(p_value) between 1 and 512
    and (p_value || '#')
      ~ '^https://[a-z][a-z0-9]{0,29}([.][a-z][a-z0-9]{0,29}){1,7}(/|(/[A-Za-z0-9_-]+)+/?)#$'
$function$;

create or replace function academy.identity_lifecycle_subject_key_is_valid(
  p_value text
) returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $function$
declare
  v_bytes bytea;
  v_code_unit integer;
  v_next_code_unit integer;
  v_offset integer := 1;
begin
  if p_value is null
    or length(p_value) not between 4 and 2048
    or length(p_value) % 4 <> 0
    or p_value !~ '^[0-9a-f]+$' then
    return false;
  end if;

  while v_offset <= length(p_value)
  loop
    v_bytes := decode(substring(p_value from v_offset for 4), 'hex');
    v_code_unit := get_byte(v_bytes, 0) * 256 + get_byte(v_bytes, 1);
    if v_code_unit = 0 then
      return false;
    elsif v_code_unit between 55296 and 56319 then
      if v_offset + 4 > length(p_value) then
        return false;
      end if;
      v_bytes := decode(substring(p_value from v_offset + 4 for 4), 'hex');
      v_next_code_unit := get_byte(v_bytes, 0) * 256 + get_byte(v_bytes, 1);
      if v_next_code_unit not between 56320 and 57343 then
        return false;
      end if;
      v_offset := v_offset + 8;
    elsif v_code_unit between 56320 and 57343 then
      return false;
    else
      v_offset := v_offset + 4;
    end if;
  end loop;
  return true;
exception when others then
  return false;
end
$function$;

do $block$
begin
  if exists (
    select 1
    from academy.identity_lifecycle_projection
    where not academy.identity_lifecycle_issuer_is_canonical(issuer)
      or not academy.identity_lifecycle_subject_key_is_valid(subject_key)
  ) then
    raise exception 'Existing Identity lifecycle principals violate the producer contract';
  end if;
end
$block$;

revoke all on function academy.identity_lifecycle_issuer_is_canonical(text)
  from public, academy_runtime;
revoke all on function academy.identity_lifecycle_subject_key_is_valid(text)
  from public, academy_runtime;
