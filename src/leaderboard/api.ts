import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import { TOP_N } from './rules';

export interface BoardRow {
  rank: number;
  nickname: string;
  score: number;
}

export interface Standing {
  /** null if the run wasn't saved and the name has no earlier score. */
  rank: number | null;
  total: number;
  best: number | null;
}

export interface Board {
  top: BoardRow[];
  me: Standing | null;
  /** Why the run wasn't saved (e.g. 'rate_limited'), or null. */
  rejected: string | null;
}

/** Give up on the leaderboard after this long (the game never waits for it). */
export const TIMEOUT_MS = 8000;

export interface LeaderboardClient {
  readonly configured: boolean;
  playCount(): Promise<number | null>;
  addPlay(deviceId: string): Promise<number | null>;
  submitAndLoad(nickname: string, score: number, runSeconds: number, deviceId: string): Promise<Board | null>;
}

/** Supabase answered 404: the function (with these arguments) doesn't exist there. */
class NoSuchFunction extends Error {}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Talks to Supabase's REST API with plain fetch (no SDK) and only the anon key. Any failure -
 * offline, timeout, Supabase down, bad response - resolves to null ("Leaderboard unavailable").
 */
/**
 * Dev builds only: a test server can be set in localStorage ('busgame.lbDev' = {"url","key"}).
 * Vite removes this from production builds (import.meta.env.DEV is false there).
 */
function devOverride(): { url: string; key: string } | null {
  if (!import.meta.env.DEV) return null;
  try {
    const v = JSON.parse(localStorage.getItem('busgame.lbDev') ?? 'null');
    return v && typeof v.url === 'string' && typeof v.key === 'string' ? v : null;
  } catch {
    return null;
  }
}

export class SupabaseLeaderboard implements LeaderboardClient {
  constructor(
    private url = devOverride()?.url ?? SUPABASE_URL,
    private key = devOverride()?.key ?? SUPABASE_ANON_KEY,
    private fetchFn: FetchLike = (u, i) => fetch(u, i),
    private timeoutMs = TIMEOUT_MS,
  ) {
    this.url = this.url.replace(/\/+$/, '');
  }

  get configured(): boolean {
    const local = import.meta.env.DEV && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(this.url);
    return (local || /^https:\/\/\S+$/.test(this.url)) && this.key.length > 20;
  }

  private async rpc<T>(name: string, body: unknown, signal: AbortSignal): Promise<T> {
    const res = await this.fetchFn(`${this.url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
      cache: 'no-store',
    });
    if (res.status === 404) throw new NoSuchFunction(name);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  /** Total runs ever started ("Played N times"), or null if it can't be loaded. */
  async playCount(): Promise<number | null> {
    if (!this.configured) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const n = await this.rpc<unknown>('play_count', {}, ctrl.signal);
      return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * A run started: +1 on the shared counter. Fire and forget - never awaited by the game, never
   * throws. Resolves to the new total, or null.
   */
  async addPlay(deviceId: string): Promise<number | null> {
    if (!this.configured) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const r = await this.rpc<Record<string, unknown>>('add_play', { p_device: deviceId }, ctrl.signal);
      return typeof r?.total === 'number' && Number.isFinite(r.total) ? r.total : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async submitAndLoad(nickname: string, score: number, runSeconds: number, deviceId: string): Promise<Board | null> {
    if (!this.configured) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const args = { p_nickname: nickname, p_score: Math.max(0, Math.floor(score)), p_run_seconds: Math.round(Math.max(0, runSeconds) * 100) / 100 };
      let r: Record<string, unknown>;
      try {
        r = await this.rpc<Record<string, unknown>>('submit_score', { ...args, p_device: deviceId }, ctrl.signal);
      } catch (e) {
        // A database that still has the older submit_score (no device id) answers 404: send it
        // the old way, so the leaderboard keeps working whichever is updated first.
        if (!(e instanceof NoSuchFunction)) throw e;
        r = await this.rpc<Record<string, unknown>>('submit_score', args, ctrl.signal);
      }
      // The top list is read after the submission so the new score is in it.
      const top = await this.rpc<unknown[]>('leaderboard_top', { p_limit: TOP_N }, ctrl.signal);
      return parseBoard(r, top);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : null);

/** Validate the two responses (throws on anything unexpected, which means "unavailable"). */
export function parseBoard(submit: Record<string, unknown>, top: unknown[]): Board {
  if (!submit || typeof submit !== 'object' || !Array.isArray(top)) throw new Error('bad response');
  const rows: BoardRow[] = top.slice(0, TOP_N).map((x) => {
    const o = x as Record<string, unknown>;
    const rank = num(o.rank);
    const score = num(o.score);
    if (rank === null || score === null || typeof o.nickname !== 'string') throw new Error('bad row');
    return { rank, score, nickname: o.nickname };
  });
  const total = num(submit.total);
  const me: Standing | null = total === null ? null : { rank: num(submit.rank), total, best: num(submit.best) };
  const ok = submit.ok === true;
  return { top: rows, me, rejected: ok ? null : typeof submit.reason === 'string' ? submit.reason : 'unknown' };
}
