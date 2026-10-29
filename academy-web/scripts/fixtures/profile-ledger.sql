create schema academy;
    create role anon; create role authenticated;
    create role service_role bypassrls; create role academy_runtime bypassrls; create role academy_staff_admin;
    create table academy.users(id uuid primary key, issuer text not null, subject text not null);
    create table academy.service_activation(user_id uuid primary key references academy.users(id) on delete cascade,status text not null);
    create function academy.has_staff_role(uuid,text) returns boolean language sql as
      'select exists(select 1 from academy.users where id=$1 and subject=''owner'' and $2=''owner'')';
    -- Synthetic minimal harness only; current-contract tests replace this with
    -- the actual 0004 entitlement function and table before issuing attempts.
    create function academy.has_course_entitlement(uuid,text) returns boolean language sql as 'select true';
    create table academy.attempt(
      attempt_id uuid primary key, user_id uuid references academy.users(id) on delete cascade,
      course_slug text, node_id text, challenge_id text, challenge_version text,
      params jsonb not null, outcome jsonb, claim_token uuid, progress_epoch bigint,
      result_recorded_at timestamptz);
    create table academy.test_progress(user_id uuid, node_id text, status text);
    create function academy.progress_write_allowed(uuid,text,bigint) returns boolean
      language sql as 'select true';
    create function academy.record_node_progress(uuid,text,text,text,jsonb,jsonb,jsonb,uuid,text)
      returns void language plpgsql as $$begin
      if current_setting('test.reject_progress',true) = '1' then raise exception 'injected progress failure'; end if;
      insert into academy.test_progress values ($1,$3,$4); end;$$;
    create function academy.stamp_result() returns trigger language plpgsql as $$begin
      if new.outcome is not null and old.outcome is null then new.result_recorded_at:=now(); end if;
      return new; end;$$;
    create trigger stamp_result before update on academy.attempt for each row execute function academy.stamp_result();
    grant usage on schema academy to academy_runtime,service_role,anon,authenticated;
    grant usage on schema academy to academy_staff_admin;
    grant select on academy.users to service_role;
    grant select, insert, update on academy.users to academy_runtime;
    grant select on academy.service_activation to academy_runtime,service_role;
    grant select,insert,update on academy.attempt to academy_runtime,service_role;
    grant insert,select on academy.test_progress to academy_runtime,service_role;
