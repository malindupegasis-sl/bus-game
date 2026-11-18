import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AudioManager, CHIPMUNK_RATE } from '../src/audio/audio';

/** Minimal stand-in for the song's <audio> element that records what the game does to it. */
class FakeSong {
  paused = true;
  currentTime = 0;
  duration = 210;
  muted = false;
  playbackRate = 1;
  pitchWrites = 0;
  plays = 0;
  loads = 0;
  advancing = true;
  private listeners = new Map<string, (() => void)[]>();
  set preservesPitch(_v: boolean) {
    this.pitchWrites++;
  }
  get preservesPitch() {
    return true;
  }
  play() {
    this.plays++;
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  load() {
    this.loads++;
    for (const f of this.listeners.get('loadedmetadata') ?? []) f();
  }
  addEventListener(type: string, f: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), f]);
  }
}

let restore: () => void;
beforeAll(() => {
  const g = globalThis as unknown as { document?: unknown };
  const had = 'document' in g;
  g.document = { visibilityState: 'visible' };
  restore = () => {
    if (!had) delete g.document;
  };
});
afterAll(() => restore());

function setup() {
  const a = new AudioManager();
  const el = new FakeSong();
  const raw = a as unknown as Record<string, unknown>;
  raw.song = el;
  raw.ctx = { state: 'running', resume: () => Promise.resolve(), suspend: () => Promise.resolve() };
  a.startMusic();
  let now = 1000;
  const run = (seconds: number) => {
    for (let i = 0; i < seconds * 60; i++) {
      now += 1000 / 60;
      if (!el.paused && el.advancing) el.currentTime += (el.playbackRate / 60);
      a.tick(now);
    }
  };
  return { a, el, run };
}

describe('music survives boosts', () => {
  it('20 boosts in a row: only the speed changes, preservesPitch is never touched, the song keeps playing', () => {
    const { a, el, run } = setup();
    expect(el.paused).toBe(false);
    for (let i = 0; i < 20; i++) {
      run(3);
      a.setBoost(true);
      expect(el.playbackRate).toBe(CHIPMUNK_RATE);
      run(11);
      a.setBoost(false);
      expect(el.playbackRate).toBe(1);
      expect(el.paused).toBe(false);
    }
    expect(el.pitchWrites).toBe(0);
    expect(a.log.some((l) => l.includes('boost on'))).toBe(true);
    expect(a.log.length).toBeLessThanOrEqual(8);
  });

  it('if iOS pauses the song during a boost, the watchdog restarts it at the boost rate', () => {
    const { a, el, run } = setup();
    run(1);
    a.setBoost(true);
    run(1);
    el.pause(); // system interruption
    const plays = el.plays;
    run(0.5);
    expect(el.paused).toBe(false);
    expect(el.plays).toBeGreaterThan(plays);
    expect(el.playbackRate).toBe(CHIPMUNK_RATE);
    a.setBoost(false);
    el.pause();
    run(0.5);
    expect(el.paused).toBe(false);
    expect(el.playbackRate).toBe(1);
  });

  it('if the song gets stuck (playing but time frozen) after a boost, it is nudged, then reloaded at the same spot', () => {
    const { a, el, run } = setup();
    run(2);
    a.setBoost(true);
    run(2);
    a.setBoost(false);
    el.advancing = false;
    const t = el.currentTime;
    run(5);
    expect(el.loads).toBe(1);
    expect(el.currentTime).toBeCloseTo(t, 3);
    expect(a.log.some((l) => l.includes('reloading'))).toBe(true);
    el.advancing = true;
    run(1);
    expect(el.paused).toBe(false);
  });
});
