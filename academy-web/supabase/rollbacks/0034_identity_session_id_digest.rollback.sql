-- Hashing is one-way and downgrading would restore replayable session bearers.
-- This rollback is blocked intentionally. Recovery requires a separately
-- reviewed restore from the verified pre-migration backup, followed by the
-- compatible application rollback and an explicit live-session decision.

do $$
begin
  raise exception 'Identity session digest rollback is blocked; restore a verified pre-migration snapshot instead'
    using errcode = '55000';
end
$$;
