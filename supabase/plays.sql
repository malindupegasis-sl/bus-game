-- LANKAN BUS LEGENDZ: "Played N times" counter.
-- Paste this whole file into the Supabase SQL editor and press Run (after leaderboard.sql).
-- Safe to run again: it never resets the count.
--
--   * public.play_counter: one row holding the total number of runs started. No API access.
--   * public.play_rate_limits: private bookkeeping for rate limiting. No API access.
--   * public.add_play(device): +1 when a run starts (rate-limited per device and per IP); returns the total.
--   * public.play_count(): the current total.
-- The anon role can ONLY call those two functions.

-- ------------------------------------------------------------------ tables

create table if not exists public.play_counter (
  id smallint primary key default 1 check (id = 1),  -- exactly one row
  total bigint not null default 0 check (total >= 0)
);
alter table public.play_counter enable row level security;

-- Start from the runs already on the leaderboard (only the first time; re-running keeps the count).
insert into public.play_counter (id, total)
select 1, (select count(*) from public.scores)
on conflict (id) do nothing;

create table if not exists public.play_rate_limits (
  client_key text not null,
  at timestamptz not null default clock_timestamp()
);
create index if not exists play_rate_limits_client on public.play_rate_limits (client_key, at);
create index if not exists play_rate_limits_at on public.play_rate_limits (at);
alter table public.play_rate_limits enable row level security;

-- ------------------------------------------------------------------ access: none to the tables

revoke all on table public.play_counter from public, anon, authenticated;
revoke all on table public.play_rate_limits from public, anon, authenticated;
-- No policies: with RLS on and no grants, the API can't see these tables at all.

-- ------------------------------------------------------------------ functions

-- The current total.
create or replace function public.play_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select total from public.play_counter where id = 1), 0);
$$;

-- A run started: +1, unless this device or network is going too fast. Returns {"ok", "total"}.
-- p_device is a random id the game keeps on the device (32 hex characters). Only a hash of it,
-- and a hash of the IP address, are stored, and only for an hour.
-- Limits: per device, 1 per second and 60 per 10 minutes; per IP address (shared by everyone on
-- the same wifi or mobile network), 200 per 10 minutes; overall, 1,000 per minute.
create or replace function public.add_play(p_device text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_headers jsonb;
  v_ip text;
  v_ip_key text;
  v_dev_key text;
  v_now timestamptz := clock_timestamp();
  v_total bigint;
begin
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

  delete from public.play_rate_limits where at < v_now - interval '1 hour';

  if exists (select 1 from public.play_rate_limits where client_key = v_dev_key and at > v_now - interval '1 second')
     or (select count(*) from public.play_rate_limits where client_key = v_dev_key and at > v_now - interval '10 minutes') >= 60
     or (select count(*) from public.play_rate_limits where client_key = v_ip_key and at > v_now - interval '10 minutes') >= 200
     or (select count(*) from public.play_rate_limits where at > v_now - interval '1 minute') >= 2000 then
    return jsonb_build_object('ok', false, 'total', public.play_count());
  end if;

  insert into public.play_rate_limits (client_key, at) values (v_dev_key, v_now), (v_ip_key, v_now);
  insert into public.play_counter (id, total) values (1, 1)
    on conflict (id) do update set total = public.play_counter.total + 1
    returning total into v_total;
  return jsonb_build_object('ok', true, 'total', v_total);
end;
$$;

revoke all on function public.play_count() from public, anon, authenticated;
revoke all on function public.add_play(text) from public, anon, authenticated;
grant execute on function public.play_count() to anon, authenticated;
grant execute on function public.add_play(text) to anon, authenticated;

notify pgrst, 'reload schema';
