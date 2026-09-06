-- The prior implementation can recreate an erased profile and replace a newer
-- verified email. There is no security-preserving downgrade for this migration,
-- so an automated rollback is blocked before changing any object. Recovery must
-- use a separately reviewed forward migration that preserves lifecycle fencing.

do $$
begin
  raise exception 'Identity lifecycle runtime enforcement rollback is blocked'
    using errcode = '55000';
end
$$;
