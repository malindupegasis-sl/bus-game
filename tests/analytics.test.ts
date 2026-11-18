import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _analytics, scoreBucket, track } from '../src/analytics';

const g = globalThis as unknown as { window?: { goatcounter?: unknown } };

beforeEach(() => {
  vi.useFakeTimers();
  g.window = {};
  _analytics.reset();
});
afterEach(() => {
  vi.useRealTimers();
  delete g.window;
});

describe('analytics', () => {
  it('score buckets', () => {
    expect(scoreBucket(0)).toBe('run-end/0-500');
    expect(scoreBucket(499)).toBe('run-end/0-500');
    expect(scoreBucket(500)).toBe('run-end/500-1000');
    expect(scoreBucket(999)).toBe('run-end/500-1000');
    expect(scoreBucket(1000)).toBe('run-end/1000+');
    expect(scoreBucket(25000)).toBe('run-end/1000+');
  });

  it('sends events as GoatCounter events, later (never inside the call)', () => {
    const sent: unknown[] = [];
    g.window!.goatcounter = { count: (v: unknown) => sent.push(v) };
    track('run-start');
    expect(sent).toHaveLength(0); // deferred out of the game frame
    vi.runAllTimers();
    expect(sent).toEqual([{ path: 'run-start', title: 'Run started', event: true }]);
  });

  it('queues while the script is still loading, then sends', () => {
    track('run-start');
    track('boost');
    vi.advanceTimersByTime(100);
    const sent: { path: string }[] = [];
    g.window!.goatcounter = { count: (v: { path: string }) => sent.push(v) };
    vi.advanceTimersByTime(2100);
    expect(sent.map((s) => s.path)).toEqual(['run-start', 'boost']);
  });

  it('blocked script: nothing throws, the queue stays small and is dropped after ~20 s', () => {
    for (let i = 0; i < 100; i++) expect(() => track('run-start')).not.toThrow();
    expect(_analytics.queue.length).toBeLessThanOrEqual(20);
    vi.advanceTimersByTime(30000);
    expect(_analytics.queue.length).toBe(0);
  });

  it('a GoatCounter error never reaches the game', () => {
    g.window!.goatcounter = { count: () => { throw new Error('boom'); } };
    expect(() => {
      track('share-whatsapp');
      vi.runAllTimers();
    }).not.toThrow();
  });
});
