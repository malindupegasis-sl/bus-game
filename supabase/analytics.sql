-- LANKAN BUS LEGENDZ: four queries for the Supabase SQL editor.
-- Save each one as its own snippet (SQL Editor -> paste one query -> Save). Read-only.
-- Days are Sri Lanka time (Asia/Colombo). Notes: every submitted run is a row in public.scores
-- (runs refused by the rate limit or the impossible-score check aren't stored); a "player" is a
-- nickname, case-insensitive (nickname_key).

-- 1. Total runs per day (with how many different players played that day), newest first.
select
  (created_at at time zone 'Asia/Colombo')::date as day,
  count(*) as runs,
  count(distinct nickname_key) as players
from public.scores
group by 1
order by 1 desc;

-- 2. Number of unique players: all time, last 7 days, today.
select
  count(distinct nickname_key) as players_all_time,
  count(distinct nickname_key) filter (where created_at >= now() - interval '7 days') as players_last_7_days,
  count(distinct nickname_key) filter (
    where (created_at at time zone 'Asia/Colombo')::date = (now() at time zone 'Asia/Colombo')::date
  ) as players_today
from public.scores;

-- 3. Average run length (seconds): all time and last 7 days, with the median and the longest.
select
  'all time' as period,
  count(*) as runs,
  round(avg(run_seconds), 1) as avg_seconds,
  round((percentile_cont(0.5) within group (order by run_seconds))::numeric, 1) as median_seconds,
  max(run_seconds) as longest_seconds
from public.scores
union all
select
  'last 7 days',
  count(*),
  round(avg(run_seconds), 1),
  round((percentile_cont(0.5) within group (order by run_seconds))::numeric, 1),
  max(run_seconds)
from public.scores
where created_at >= now() - interval '7 days';

-- 4. Score distribution: runs per score band, with the share of all runs.
with bands(lo, hi, label) as (
  values (0, 100, '0-99'), (100, 250, '100-249'), (250, 500, '250-499'), (500, 1000, '500-999'),
         (1000, 2000, '1,000-1,999'), (2000, 5000, '2,000-4,999'), (5000, 10000, '5,000-9,999'),
         (10000, null, '10,000+')
)
select
  b.label as score,
  count(s.id) as runs,
  round(100.0 * count(s.id) / nullif(sum(count(s.id)) over (), 0), 1) as percent
from bands b
left join public.scores s on s.score >= b.lo and (b.hi is null or s.score < b.hi)
group by b.lo, b.label
order by b.lo;
