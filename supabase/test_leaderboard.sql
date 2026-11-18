-- Local test of leaderboard.sql (NOT for Supabase). Needs a scratch Postgres database with the roles
-- Supabase has: run   psql -v ON_ERROR_STOP=1 -f supabase/setup_local.sql -f supabase/leaderboard.sql -f supabase/test_leaderboard.sql
-- Every check raises an exception on failure.

\set QUIET on
set client_min_messages = warning;
truncate public.scores, public.score_rate_limits restart identity;

create or replace function pg_temp.req(ip text) returns void language sql as $$
  select set_config('request.headers', jsonb_build_object('x-forwarded-for', ip || ', 10.0.0.1')::text, false);
$$;
create or replace function pg_temp.check(cond boolean, what text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', what; end if;
  raise notice 'PASS: %', what;
end $$;
set client_min_messages = notice;

-- As the public (anon) API role from here on.
set role anon;

-- Valid submission: saved, rank 1 of 1.
select pg_temp.req('1.1.1.1');
select pg_temp.check((select (r ->> 'ok')::boolean and (r ->> 'rank')::int = 1 and (r ->> 'total')::int = 1
  from public.submit_score('  Kasun   99 ', 1200, 30.5) r), 'valid run saved, rank 1 of 1, name trimmed');
select pg_temp.check((select nickname = 'Kasun 99' from public.scores limit 1), 'nickname stored normalized');

-- Rate limit: same client again within 2 s.
select pg_temp.check((select r ->> 'reason' = 'rate_limited' and (r ->> 'rank')::int = 1
  from public.submit_score('Kasun 99', 5000, 60) r), 'second submission within 2 s rate-limited (rank still returned)');
-- Same nickname from another client within 2 s is limited too.
select pg_temp.req('2.2.2.2');
select pg_temp.check((select r ->> 'reason' = 'rate_limited' from public.submit_score('KASUN 99', 5000, 60) r), 'same nickname from another IP within 2 s rate-limited');

-- Other players (different IPs).
select pg_temp.req('3.3.3.3');
select pg_temp.check((select (r ->> 'rank')::int = 1 and (r ->> 'total')::int = 2 from public.submit_score('Nimal', 3000, 40) r), 'second player ranks 1 of 2');
select pg_temp.req('4.4.4.4');
select pg_temp.check((select (r ->> 'rank')::int = 3 and (r ->> 'total')::int = 3 from public.submit_score('Amaya', 100, 5) r), 'third player ranks 3 of 3');

-- Impossible scores and bad input.
select pg_temp.req('5.5.5.5');
select pg_temp.check((select r ->> 'reason' = 'impossible_score' from public.submit_score('Ruwan', 500 + 250 * 10 + 1, 10) r), 'score above 500 + 250/s rejected');
select pg_temp.req('5.5.5.6');
select pg_temp.check((select (r ->> 'ok')::boolean from public.submit_score('Ruwan', 500 + 250 * 10, 10) r), 'score right at the limit accepted');
select pg_temp.req('5.5.5.7');
select pg_temp.check((select r ->> 'reason' = 'bad_run' from public.submit_score('Ruwan2', 10, -1) r), 'negative run length rejected');
select pg_temp.check((select r ->> 'reason' = 'impossible_score' from public.submit_score('Ruwan2', -5, 10) r), 'negative score rejected');
select pg_temp.check((select r ->> 'reason' = 'impossible_score' from public.submit_score('Ruwan2', 501, 0) r), 'score above the cap for a 0 s run rejected');
select pg_temp.check((select r ->> 'reason' = 'bad_name' from public.submit_score('ab', 10, 10) r), 'name too short rejected');
select pg_temp.check((select r ->> 'reason' = 'bad_name' from public.submit_score('abcdefghijklm', 10, 10) r), 'name too long rejected');
select pg_temp.check((select r ->> 'reason' = 'bad_name' from public.submit_score('Kas_un', 10, 10) r), 'underscore rejected');
select pg_temp.check((select r ->> 'reason' = 'bad_name' from public.submit_score('Kasun😀', 10, 10) r), 'emoji rejected');
select pg_temp.check((select r ->> 'reason' = 'rude_name' from public.submit_score('Sh1t Driver', 10, 10) r), 'rude word (leet) rejected');
select pg_temp.check((select r ->> 'reason' = 'rude_name' from public.submit_score('huththa', 10, 10) r), 'Sinhala insult rejected');
select pg_temp.check((select r ->> 'reason' = 'rude_name' from public.submit_score('big a55', 10, 10) r), 'short rude whole word rejected');
select pg_temp.req('5.5.5.8');
select pg_temp.check((select (r ->> 'ok')::boolean from public.submit_score('Prashitha', 10, 10) r), 'ordinary name containing a rude part (Prashitha) allowed');
select pg_temp.req('5.5.5.9');
select pg_temp.check((select (r ->> 'ok')::boolean from public.submit_score('Hassan', 10, 10) r), 'Hassan allowed');

-- Best score per nickname only, case-insensitive.
select pg_sleep(2.1);  -- past the 2 s gap for this nickname
select pg_temp.req('6.6.6.6');
select pg_temp.check((select (r ->> 'ok')::boolean and (r ->> 'best')::int = 1200
  from public.submit_score('kasun 99', 900, 20) r), 'a worse run is saved, best stays 1200');
select pg_temp.check((select count(*) = 1 from public.leaderboard_top(10) where lower(nickname) = 'kasun 99'), 'leaderboard: one row per nickname');
select pg_temp.check((select score = 1200 from public.leaderboard_top(10) where lower(nickname) = 'kasun 99'), 'leaderboard: shows the best score');
select pg_temp.check((select count(*) = 2 from public.scores where nickname_key = 'kasun 99'), 'every (non-rate-limited) run is stored');
select pg_temp.check((select string_agg(nickname || ':' || score || '#' || rank, ',') = 'Nimal:3000#1,Ruwan:3000#1,Kasun 99:1200#3,Amaya:100#4,Prashitha:10#5,Hassan:10#5'
  from public.leaderboard_top(10)), 'leaderboard order, ties share a rank');
select pg_temp.check((select count(*) = 2 from public.leaderboard_top(2)), 'limit respected');

-- Per-client 10-minute cap (30), with the 2 s gap side-stepped by back-dating earlier rows.
reset role;
insert into public.score_rate_limits (client_key, at)
  select encode(sha256(convert_to('ip:7.7.7.7', 'UTF8')), 'hex'), clock_timestamp() - interval '5 minutes' from generate_series(1, 30);
set role anon;
select pg_temp.req('7.7.7.7');
select pg_temp.check((select r ->> 'reason' = 'rate_limited' from public.submit_score('Sunil', 50, 10) r), '31st submission in 10 minutes from one IP rate-limited');

-- Direct writes and private objects are off limits to anon.
do $$ begin
  begin insert into public.scores (nickname, score, run_seconds) values ('Hacker', 999999, 5);
    raise exception 'FAIL: anon could insert';
  exception when insufficient_privilege then raise notice 'PASS: anon cannot insert into scores'; end;
  begin update public.scores set score = 999999;
    raise exception 'FAIL: anon could update';
  exception when insufficient_privilege then raise notice 'PASS: anon cannot update scores'; end;
  begin delete from public.scores;
    raise exception 'FAIL: anon could delete';
  exception when insufficient_privilege then raise notice 'PASS: anon cannot delete scores'; end;
  begin perform count(*) from public.score_rate_limits;
    raise exception 'FAIL: anon could read rate limits';
  exception when insufficient_privilege then raise notice 'PASS: anon cannot read score_rate_limits'; end;
  begin perform public.lb_is_rude('x');
    raise exception 'FAIL: anon could call lb_is_rude';
  exception when insufficient_privilege then raise notice 'PASS: anon cannot call helper functions'; end;
end $$;
select pg_temp.check((select count(*) > 0 from public.scores), 'anon can read scores');
reset role;
select pg_temp.check((select count(*) = 0 from public.score_rate_limits where client_key like '%.%'), 'raw IP addresses are never stored');
\echo ALL SQL CHECKS PASSED
