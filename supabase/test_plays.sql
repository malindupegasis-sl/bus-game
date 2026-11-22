-- Local test of plays.sql (NOT for Supabase). Run after setup_local.sql, leaderboard.sql, plays.sql.
\set QUIET on
create or replace function pg_temp.req(ip text) returns void language sql as $$
  select set_config('request.headers', jsonb_build_object('x-forwarded-for', ip)::text, false);
$$;
create or replace function pg_temp.check(cond boolean, what text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', what; end if;
  raise notice 'PASS: %', what;
end $$;
truncate public.play_rate_limits;

select pg_temp.check((select total from public.play_counter) = (select count(*) from public.scores), 'counter starts at the number of runs already in scores');
reset role;
create temp table t0 as select public.play_count() as n;
grant select on t0 to anon;

set role anon;
select pg_temp.req('1.1.1.1');
select pg_temp.check((select public.play_count() = (select n from t0)), 'anon reads the total');
select pg_temp.check((select (r ->> 'ok')::boolean and (r ->> 'total')::bigint = (select n from t0) + 1
  from public.add_play('0123456789abcdef0123456789abcdef') r), 'a run start adds 1 and returns the new total');
select pg_temp.check((select not (r ->> 'ok')::boolean and (r ->> 'total')::bigint = (select n from t0) + 1
  from public.add_play('0123456789abcdef0123456789abcdef') r), 'same device again within 1 s: not counted, total still returned');
select pg_temp.check((select (r ->> 'ok')::boolean from public.add_play('fedcba9876543210fedcba9876543210') r), 'another device on the same network is counted');
select pg_sleep(1.1);
select pg_temp.check((select (r ->> 'ok')::boolean from public.add_play('0123456789abcdef0123456789abcdef') r), 'same device after 1 s is counted');
select pg_temp.check((select public.play_count() = (select n from t0) + 3), 'total = start + 3');

-- per-device cap: 60 per 10 minutes (back-dated rows stand in for earlier runs)
reset role;
insert into public.play_rate_limits (client_key, at)
  select 'dev:' || encode(sha256(convert_to('dev:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'UTF8')), 'hex'), clock_timestamp() - interval '5 minutes'
  from generate_series(1, 60);
set role anon;
select pg_temp.req('2.2.2.2');
select pg_temp.check((select not (r ->> 'ok')::boolean from public.add_play('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') r), '61st run start in 10 minutes from one device not counted');

-- per-IP cap (stops inflating with made-up device ids): 200 per 10 minutes
reset role;
insert into public.play_rate_limits (client_key, at)
  select 'ip:' || encode(sha256(convert_to('ip:3.3.3.3', 'UTF8')), 'hex'), clock_timestamp() - interval '5 minutes'
  from generate_series(1, 200);
set role anon;
select pg_temp.req('3.3.3.3');
select pg_temp.check((select not (r ->> 'ok')::boolean from public.add_play(md5(random()::text)) r), 'fresh device ids from a spamming IP not counted past 200 per 10 minutes');

-- junk device id: treated as one device per IP
select pg_temp.req('4.4.4.4');
select pg_temp.check((select (r ->> 'ok')::boolean from public.add_play('<script>') r), 'malformed device id still counts once');
select pg_temp.check((select not (r ->> 'ok')::boolean from public.add_play(null) r), '...but shares the per-IP "device" limit');

do $$ begin
  begin perform 1 from public.play_counter;
    raise exception 'FAIL: anon could read play_counter';
  exception when insufficient_privilege then raise notice 'PASS: anon cannot read play_counter'; end;
  begin update public.play_counter set total = 999999;
    raise exception 'FAIL: anon could update play_counter';
  exception when insufficient_privilege then raise notice 'PASS: anon cannot update play_counter'; end;
  begin insert into public.play_counter values (1, 5);
    raise exception 'FAIL: anon could insert';
  exception when insufficient_privilege then raise notice 'PASS: anon cannot insert into play_counter'; end;
  begin perform 1 from public.play_rate_limits;
    raise exception 'FAIL: anon could read play_rate_limits';
  exception when insufficient_privilege then raise notice 'PASS: anon cannot read play_rate_limits'; end;
end $$;
reset role;
select pg_temp.check((select count(*) = 0 from public.play_rate_limits where client_key like '%.%' or client_key like '%0123456789abcdef%'), 'raw IPs and device ids are never stored');
\echo ALL PLAYS CHECKS PASSED
