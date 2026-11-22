-- LANKAN BUS LEGENDZ: shared leaderboard.
-- Paste this whole file into the Supabase SQL editor and press Run. It is safe to run again.
--
-- What it sets up:
--   * public.scores: one row per finished run (nickname, score, run length, time). Row Level
--     Security on; the anon role may only READ it. Nobody can insert, update or delete through the API.
--   * public.score_rate_limits: private bookkeeping for rate limiting (no access for anon at all).
--   * public.submit_score(nickname, score, run_seconds, device): the ONLY way to add a score. It checks
--     the nickname, rejects impossible scores, rate-limits (per device, with looser per-connection
--     and overall caps), saves the run, and returns the player's rank.
--   * public.leaderboard_top(limit): the top players, each nickname's best score only.
-- The game uses only the public anon key. Never put the service_role key in the game.

-- ------------------------------------------------------------------ tables

create table if not exists public.scores (
  id bigint generated always as identity primary key,
  nickname text not null
    check (char_length(nickname) between 3 and 12 and nickname ~ '^[A-Za-z0-9]+( [A-Za-z0-9]+)*$'),
  -- Same name in any capitals counts as the same player.
  nickname_key text generated always as (lower(nickname)) stored,
  score integer not null check (score >= 0),
  run_seconds numeric(8, 2) not null check (run_seconds >= 0),
  created_at timestamptz not null default now()
);
create index if not exists scores_player_best on public.scores (nickname_key, score desc);
create index if not exists scores_by_score on public.scores (score desc);
alter table public.scores enable row level security;

create table if not exists public.score_rate_limits (
  client_key text not null,
  at timestamptz not null default clock_timestamp()
);
create index if not exists score_rate_limits_client on public.score_rate_limits (client_key, at);
create index if not exists score_rate_limits_at on public.score_rate_limits (at);
alter table public.score_rate_limits enable row level security;

-- ------------------------------------------------------------------ access
-- Start from nothing, then grant exactly what the game needs.

revoke all on table public.scores from public, anon, authenticated;
revoke all on table public.score_rate_limits from public, anon, authenticated;
revoke all on sequence public.scores_id_seq from public, anon, authenticated;

grant select on table public.scores to anon, authenticated;
drop policy if exists "Anyone can read scores" on public.scores;
create policy "Anyone can read scores" on public.scores for select to anon, authenticated using (true);
-- No insert/update/delete policies or grants: rows only arrive through submit_score() below.
-- score_rate_limits has RLS on and no policies or grants: invisible to the API.

-- ------------------------------------------------------------------ helpers (not callable from the API)

-- Basic rude-word filter (same lists as src/leaderboard/rules.ts in the game).
create or replace function public.lb_is_rude(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with s as (select translate(lower(p_name), '0134578@$!|', 'oieastbasii') as t)
  select exists (
      select 1 from s, unnest(array['fuck', 'shithead', 'bullshit', 'cunt', 'bitch', 'nigger', 'nigga', 'faggot', 'whore', 'slut', 'penis', 'vagina', 'pussy', 'wank', 'twat', 'bastard', 'asshole', 'dildo', 'hitler', 'retard', 'hutta', 'huththa', 'hutto', 'huththo', 'ponnaya', 'pakaya', 'pukaya', 'kimbi', 'wesige', 'besige', 'paiya']) as w
      where position(w in regexp_replace(s.t, '[^a-z]', '', 'g')) > 0
    )
    or exists (
      select 1 from s, unnest(regexp_split_to_array(s.t, '[^a-z]+')) as tok
      where tok = any (array['shit', 'ass', 'arse', 'sex', 'cock', 'dick', 'tits', 'fag', 'rape', 'nazi', 'cum', 'wesi', 'wesa', 'paka', 'puka', 'kari'])
    );
$$;

-- Rank (1 = best) and number of players, by each nickname's best score.
create or replace function public.lb_rank(p_key text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with best as (
    select nickname_key, max(score) as score from public.scores group by nickname_key
  ), me as (
    select score from best where nickname_key = p_key
  )
  select jsonb_build_object(
    'rank', (select 1 + count(*) from best where best.score > (select score from me)),
    'total', (select count(*) from best),
    'best', (select score from me)
  )
  where exists (select 1 from me)
  union all
  select jsonb_build_object('rank', null, 'total', (select count(*) from best), 'best', null)
  where not exists (select 1 from me)
$$;

revoke all on function public.lb_is_rude(text) from public, anon, authenticated;
revoke all on function public.lb_rank(text) from public, anon, authenticated;

-- ------------------------------------------------------------------ submit a run

-- Returns {"ok": true|false, "reason": null|"bad_name"|"rude_name"|"bad_run"|"impossible_score"|
-- "rate_limited", "rank": n|null, "total": n, "best": n|null}. Rank and total are by each nickname's
-- best score; they're filled in even when a submission is rate-limited (if the name has a score).
-- p_device: the random id the game keeps on the device (32 hex characters); optional, so older
-- copies of the game that don't send it still work (they're limited as one device per connection).
-- The earlier 3-argument version is replaced by this one.
drop function if exists public.submit_score(text, integer, numeric);
create or replace function public.submit_score(p_nickname text, p_score integer, p_run_seconds numeric, p_device text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_nickname, '')), '\s+', ' ', 'g');
  v_key text := lower(v_name);
  v_headers jsonb;
  v_ip text;
  v_ip_key text;
  v_dev_key text;
  v_now timestamptz := clock_timestamp();
  v_reason text := null;
begin
  -- Nickname: 3-12 letters, numbers and single spaces, nothing rude.
  if char_length(v_name) < 3 or char_length(v_name) > 12
     or v_name !~ '^[A-Za-z0-9]+( [A-Za-z0-9]+)*$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_name', 'rank', null, 'total', null, 'best', null);
  end if;
  if public.lb_is_rude(v_name) then
    return jsonb_build_object('ok', false, 'reason', 'rude_name', 'rank', null, 'total', null, 'best', null);
  end if;

  -- Run length and score must be possible: at most 500 + 250 points per second of run.
  if p_run_seconds is null or p_run_seconds < 0 or p_run_seconds > 7200 then
    v_reason := 'bad_run';
  elsif p_score is null or p_score < 0 or p_score > 500 + 250 * p_run_seconds then
    v_reason := 'impossible_score';
  end if;

  if v_reason is null then
    -- Rate limits, mainly per DEVICE (many players can share one IP address on mobile networks
    -- and wifi): 1 per 2 s and 30 per 10 minutes per device, the same per nickname. Device ids
    -- can be faked, so there's a looser per-connection backstop (300 per 10 minutes per IP) and an
    -- overall cap (1,000 per minute). Only hashes of the IP and device id are stored, for a day.
    begin
      v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
    exception when others then
      v_headers := null;
    end;
    v_ip := coalesce(
      nullif(btrim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), ''),
      v_headers ->> 'cf-connecting-ip',
      v_headers ->> 'x-real-ip',
      'unknown'
    );
    v_ip_key := 'ip:' || encode(sha256(convert_to('ip:' || v_ip, 'UTF8')), 'hex');
    -- A missing or malformed device id falls back to one "device" per IP address.
    v_dev_key := 'dev:' || encode(sha256(convert_to(
      case when p_device ~ '^[0-9a-f]{32}$' then 'dev:' || p_device else 'nodev:' || v_ip end, 'UTF8')), 'hex');

    delete from public.score_rate_limits where at < v_now - interval '1 day';

    if exists (
         select 1 from public.score_rate_limits
         where client_key in (v_dev_key, 'name:' || v_key) and at > v_now - interval '2 seconds'
       )
       or (select count(*) from public.score_rate_limits
           where client_key = v_dev_key and at > v_now - interval '10 minutes') >= 30
       or (select count(*) from public.score_rate_limits
           where client_key = 'name:' || v_key and at > v_now - interval '10 minutes') >= 30
       or (select count(*) from public.score_rate_limits
           where client_key = v_ip_key and at > v_now - interval '10 minutes') >= 300
       or (select count(*) from public.score_rate_limits
           where client_key like 'ip:%' and at > v_now - interval '1 minute') >= 1000 then
      v_reason := 'rate_limited';
    else
      insert into public.score_rate_limits (client_key, at)
        values (v_dev_key, v_now), (v_ip_key, v_now), ('name:' || v_key, v_now);
      insert into public.scores (nickname, score, run_seconds) values (v_name, p_score, round(p_run_seconds, 2));
    end if;
  end if;

  return jsonb_build_object('ok', v_reason is null, 'reason', v_reason) || public.lb_rank(v_key);
end;
$$;

revoke all on function public.submit_score(text, integer, numeric, text) from public, anon, authenticated;
grant execute on function public.submit_score(text, integer, numeric, text) to anon, authenticated;

-- ------------------------------------------------------------------ read the leaderboard

-- Each nickname's best score, best first (ties: whoever got there first). Max 100 rows.
create or replace function public.leaderboard_top(p_limit integer default 10)
returns table (rank bigint, nickname text, score integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with best as (
    select distinct on (nickname_key) nickname_key, nickname, score, created_at
    from public.scores
    order by nickname_key, score desc, created_at asc
  )
  select rank() over (order by score desc), nickname, score
  from best
  order by score desc, created_at asc
  limit least(greatest(coalesce(p_limit, 10), 1), 100);
$$;

revoke all on function public.leaderboard_top(integer) from public, anon, authenticated;
grant execute on function public.leaderboard_top(integer) to anon, authenticated;

-- Make the API notice the new functions straight away.
notify pgrst, 'reload schema';
