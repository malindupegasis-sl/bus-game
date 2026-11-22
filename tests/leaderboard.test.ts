import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SupabaseLeaderboard, parseBoard } from '../src/leaderboard/api';
import { isRude, nameProblem, normalizeName } from '../src/leaderboard/nickname';
import {
  LEET_FROM, LEET_TO, MAX_POINTS_PER_SECOND, MAX_RUN_SECONDS, NAME_MAX, NAME_MIN, RUDE_PARTS, RUDE_WORDS, SCORE_SLACK, TOP_N,
} from '../src/leaderboard/rules';
import { shareText } from '../src/share';
import { World } from '../src/game/world';
import { BOOST_TIME } from '../src/game/charm';
import { BUS_X } from '../src/config';

const SQL = readFileSync(new URL('../supabase/leaderboard.sql', import.meta.url), 'utf8');

describe('nicknames', () => {
  it('3-12 letters, numbers and spaces; trimmed and single-spaced', () => {
    expect(normalizeName('  Kasun   99 ')).toBe('Kasun 99');
    expect(nameProblem('ab')).toBe('short');
    expect(nameProblem('   ab   ')).toBe('short');
    expect(nameProblem('abcdefghijklm')).toBe('long');
    expect(nameProblem('Kas_un')).toBe('chars');
    expect(nameProblem('Kasun😀')).toBe('chars');
    expect(nameProblem('Kasun 99')).toBeNull();
    expect(nameProblem('ABC')).toBeNull();
  });

  it('basic rude-word filter, without blocking ordinary names', () => {
    for (const bad of ['fuck', 'Sh1t Driver', 'B!TCH', 'huththa', 'Pakaya 1', 'big a55', 'ponnaya']) expect(isRude(bad), bad).toBe(true);
    for (const ok of ['Prashitha', 'Hassan', 'Classic', 'Kasun', 'Nimal 007', 'Dickson', 'Ponnamperuma', 'Kariyawasam', 'Ashitha']) {
      expect(isRude(ok), ok).toBe(false);
    }
  });
});

describe('the SQL matches the game', () => {
  it('same limits, word lists and look-alike mapping', () => {
    expect(SQL).toContain(`char_length(nickname) between ${NAME_MIN} and ${NAME_MAX}`);
    expect(SQL).toContain(`p_score > ${SCORE_SLACK} + ${MAX_POINTS_PER_SECOND} * p_run_seconds`);
    expect(SQL).toContain(`p_run_seconds > ${MAX_RUN_SECONDS}`);
    expect(SQL).toContain(`p_limit integer default ${TOP_N}`);
    expect(SQL).toContain(`translate(lower(p_name), '${LEET_FROM}', '${LEET_TO}')`);
    const arrays = [...SQL.matchAll(/unnest\(array\[([^\]]*)\]\)|any \(array\[([^\]]*)\]\)/g)].map((m) => [...(m[1] ?? m[2]).matchAll(/'([^']+)'/g)].map((x) => x[1]));
    expect(arrays[0]).toEqual([...RUDE_PARTS]);
    expect(arrays[1]).toEqual([...RUDE_WORDS]);
  });

  it('anon only reads the table and calls the two functions; no direct writes', () => {
    expect(SQL).toMatch(/alter table public\.scores enable row level security/);
    expect(SQL).toMatch(/grant select on table public\.scores to anon, authenticated;/);
    expect(SQL).not.toMatch(/grant (insert|update|delete|all)/i);
    const execs = [...SQL.matchAll(/grant execute on function (public\.\w+)/g)].map((m) => m[1]);
    expect(execs).toEqual(['public.submit_score', 'public.leaderboard_top']);
    expect(SQL).toMatch(/revoke all on function public\.lb_is_rude\(text\) from public, anon, authenticated/);
    expect(SQL).not.toMatch(/to service_role|service_role_key|eyJ/);
  });

  it('a real run never comes near the impossible-score cap (boosted all the way, knocking off everything)', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const w = new World(seed, { pickups: false });
      let id = 1e6;
      while (w.t < 240) {
        w.charm.boostT = BOOST_TIME; // permanent boost: 1.3x road, double score, knockouts
        // A vehicle on the bus every 0.45 s (the densest traffic there is) is knocked off for +50.
        if (Math.round(w.t * 60) % 27 === 0) w.obstacles.push({ id: id++, kind: 'lorry', d0: w.d, x0: BUS_X + 10, f: 0.001, lane: w.bus.target, toLane: w.bus.target, dTell: Infinity, dSwerve: Infinity, dSwerveEnd: Infinity });
        w.step(1 / 60);
        expect(w.crashed).toBe(false);
        expect(w.score).toBeLessThanOrEqual(SCORE_SLACK + MAX_POINTS_PER_SECOND * w.t);
      }
    }
  });
});

describe('leaderboard client', () => {
  const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  const TOP = [{ rank: 1, nickname: 'Nimal', score: 3000 }, { rank: 2, nickname: 'Kasun', score: 1200 }];

  it('submits with the anon key only, then reads the top 10', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const lb = new SupabaseLeaderboard('https://x.supabase.co/', 'anon-key-0123456789abcdef', (url, init) => {
      calls.push({ url, init });
      return url.endsWith('submit_score') ? ok({ ok: true, reason: null, rank: 2, total: 2, best: 1200 }) : ok(TOP);
    });
    const b = await lb.submitAndLoad('Kasun', 1200.7, 30.456);
    expect(calls.map((c) => c.url)).toEqual(['https://x.supabase.co/rest/v1/rpc/submit_score', 'https://x.supabase.co/rest/v1/rpc/leaderboard_top']);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ p_nickname: 'Kasun', p_score: 1200, p_run_seconds: 30.46 });
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ p_limit: 10 });
    const h = calls[0].init.headers as Record<string, string>;
    expect(h.apikey).toBe('anon-key-0123456789abcdef');
    expect(h.Authorization).toBe('Bearer anon-key-0123456789abcdef');
    expect(b).toEqual({ top: TOP, me: { rank: 2, total: 2, best: 1200 }, rejected: null });
  });

  it('not configured, offline, HTTP errors, junk and timeouts all mean "unavailable" (null)', async () => {
    expect(new SupabaseLeaderboard('', '').configured).toBe(false);
    expect(await new SupabaseLeaderboard('', '').submitAndLoad('Kasun', 1, 5)).toBeNull();
    const key = 'anon-key-0123456789abcdef';
    const url = 'https://x.supabase.co';
    expect(await new SupabaseLeaderboard(url, key, () => Promise.reject(new TypeError('offline'))).submitAndLoad('Kasun', 1, 5)).toBeNull();
    expect(await new SupabaseLeaderboard(url, key, () => Promise.resolve(new Response('down', { status: 503 }))).submitAndLoad('Kasun', 1, 5)).toBeNull();
    expect(await new SupabaseLeaderboard(url, key, (u) => (u.endsWith('submit_score') ? ok({ ok: true, total: 1 }) : ok({ nope: 1 }))).submitAndLoad('Kasun', 1, 5)).toBeNull();
    const hang = (_u: string, init: RequestInit) => new Promise<Response>((_res, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))));
    const t0 = Date.now();
    expect(await new SupabaseLeaderboard(url, key, hang, 50).submitAndLoad('Kasun', 1, 5)).toBeNull();
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it('a rate-limited run still shows the board and the player\'s standing', () => {
    expect(parseBoard({ ok: false, reason: 'rate_limited', rank: 27, total: 54, best: 800 }, TOP)).toEqual({ top: TOP, me: { rank: 27, total: 54, best: 800 }, rejected: 'rate_limited' });
    expect(parseBoard({ ok: false, reason: 'impossible_score', rank: null, total: 54, best: null }, []).me).toEqual({ rank: null, total: 54, best: null });
  });
});

describe('share text', () => {
  it('includes the rank when known, else just the score', () => {
    expect(shareText(2140, 'https://malindupegasis-sl.github.io/bus-game/', 3)).toBe("I'm #3 on LANKAN BUS LEGENDZ with 2,140 points! Beat me: https://malindupegasis-sl.github.io/bus-game/");
    expect(shareText(2140, 'https://malindupegasis-sl.github.io/bus-game/')).toBe('I scored 2,140 in LANKAN BUS LEGENDZ! Beat me: https://malindupegasis-sl.github.io/bus-game/');
  });
});

describe('play counter', () => {
  const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  const url = 'https://x.supabase.co';
  const key = 'anon-key-0123456789abcdef';

  it('label: sentence case with commas', async () => {
    const { playsLabel } = await import('../src/share');
    expect(playsLabel(1234)).toBe('Played 1,234 times');
    expect(playsLabel(1)).toBe('Played 1 time');
    expect(playsLabel(0)).toBe('Played 0 times');
  });

  it('reads the total and adds a play through the two functions only', async () => {
    const calls: { url: string; body: string }[] = [];
    const lb = new SupabaseLeaderboard(url, key, (u, init) => {
      calls.push({ url: u, body: String(init.body) });
      return u.endsWith('play_count') ? ok(1234) : ok({ ok: true, total: 1235 });
    });
    expect(await lb.playCount()).toBe(1234);
    expect(await lb.addPlay('0123456789abcdef0123456789abcdef')).toBe(1235);
    expect(calls.map((c) => c.url)).toEqual([`${url}/rest/v1/rpc/play_count`, `${url}/rest/v1/rpc/add_play`]);
    expect(JSON.parse(calls[1].body)).toEqual({ p_device: '0123456789abcdef0123456789abcdef' });
  });

  it('any failure means null (the line is hidden), never a throw or a 0', async () => {
    expect(await new SupabaseLeaderboard('', '').playCount()).toBeNull();
    expect(await new SupabaseLeaderboard(url, key, () => Promise.reject(new TypeError('offline'))).playCount()).toBeNull();
    expect(await new SupabaseLeaderboard(url, key, () => Promise.resolve(new Response('x', { status: 503 }))).playCount()).toBeNull();
    expect(await new SupabaseLeaderboard(url, key, () => ok('lots')).playCount()).toBeNull();
    expect(await new SupabaseLeaderboard(url, key, () => Promise.reject(new TypeError('offline'))).addPlay('x')).toBeNull();
    const hang = (_u: string, init: RequestInit) => new Promise<Response>((_r, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('a', 'AbortError'))));
    expect(await new SupabaseLeaderboard(url, key, hang, 30).playCount()).toBeNull();
  });

  it('the SQL: anon can only call play_count and add_play; the counter starts from scores', () => {
    const P = readFileSync(new URL('../supabase/plays.sql', import.meta.url), 'utf8');
    expect([...P.matchAll(/grant execute on function (public\.\w+)/g)].map((m) => m[1])).toEqual(['public.play_count', 'public.add_play']);
    expect(P).not.toMatch(/grant (select|insert|update|delete|all)/i);
    expect(P).toMatch(/alter table public\.play_counter enable row level security/);
    expect(P).toMatch(/select 1, \(select count\(\*\) from public\.scores\)\s+on conflict \(id\) do nothing/);
  });
});
