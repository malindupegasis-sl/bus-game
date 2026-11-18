/**
 * GoatCounter analytics (cookie-free; https://busgamemalindu.goatcounter.com). The page view is
 * counted by GoatCounter's own script in index.html; this sends the custom events.
 *
 * Privacy: only the fixed event names below are ever sent - never a nickname, an exact score or
 * anything typed by the player (run-end only says which score bucket it fell in).
 * Performance/robustness: events are sent outside the game's frame (setTimeout 0), everything is
 * wrapped in try/catch, and if the script is blocked or slow the events are queued briefly and then
 * dropped. The game never waits for analytics.
 */

export type AnalyticsEvent =
  | 'run-start'
  | 'run-end/0-500'
  | 'run-end/500-1000'
  | 'run-end/1000+'
  | 'boost'
  | 'share-whatsapp'
  | 'leaderboard-viewed'
  | 'leaderboard-unavailable';

const TITLES: Record<AnalyticsEvent, string> = {
  'run-start': 'Run started',
  'run-end/0-500': 'Run ended: score 0-500',
  'run-end/500-1000': 'Run ended: score 500-1000',
  'run-end/1000+': 'Run ended: score 1000+',
  boost: 'Boost triggered',
  'share-whatsapp': 'WhatsApp share tapped',
  'leaderboard-viewed': 'Leaderboard viewed',
  'leaderboard-unavailable': 'Leaderboard unavailable',
};

export function scoreBucket(score: number): AnalyticsEvent {
  if (score < 500) return 'run-end/0-500';
  if (score < 1000) return 'run-end/500-1000';
  return 'run-end/1000+';
}

interface GoatCounter {
  count(vars: { path: string; title: string; event: boolean }): void;
}

/** Events waiting for GoatCounter's script to load (kept small; dropped if it never arrives). */
const MAX_QUEUE = 20;
const queue: AnalyticsEvent[] = [];
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retries = 0;

function counter(): GoatCounter | null {
  try {
    const gc = (window as unknown as { goatcounter?: Partial<GoatCounter> }).goatcounter;
    return gc && typeof gc.count === 'function' ? (gc as GoatCounter) : null;
  } catch {
    return null;
  }
}

function flush(): void {
  const gc = counter();
  if (!gc) {
    // Script not here yet (slow network) or blocked: try a few more times, then give up quietly.
    if (queue.length && !retryTimer && retries < 10) {
      retries++;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        flush();
      }, 2000);
    }
    if (retries >= 10) queue.length = 0;
    return;
  }
  retries = 0;
  while (queue.length) {
    const e = queue.shift()!;
    try {
      gc.count({ path: e, title: TITLES[e], event: true });
    } catch {
      /* analytics must never break the game */
    }
  }
}

/** Record a custom event. Cheap and safe to call from the game loop. */
export function track(e: AnalyticsEvent): void {
  try {
    if (queue.length >= MAX_QUEUE) queue.shift();
    queue.push(e);
    setTimeout(flush, 0);
  } catch {
    /* ignore */
  }
}

/** For tests. */
export const _analytics = { queue, reset: () => ((queue.length = 0), (retries = 0)) };
