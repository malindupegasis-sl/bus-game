import { describe, expect, it } from 'vitest';
import { BUS_X, laneY } from '../src/config';
import { musicAction, STUCK_PLAY_AFTER, STUCK_RELOAD_AFTER, type MusicObservation } from '../src/audio/musicHealth';
import { registerTap, TAP_WINDOW, TAPS_TO_TOGGLE } from '../src/debug';
import { Bus } from '../src/game/bus';
import { World } from '../src/game/world';
import {
  BUS_W, FRONT_CHARM, busColumns, busExtent, busGroups, busLimits, busPose, busWheels, frontCharmAnchor,
} from '../src/render/busPose';
import { BUS_BODY_H, BUS_WHEELS } from '../src/render/sprites';

describe('music watchdog', () => {
  const ok: MusicObservation = {
    want: true, usingSong: true, songPaused: false, songTime: 12, lastSongTime: 11.8, stuckFor: 0, ctxState: 'running',
  };
  it('does nothing while the song plays normally', () => expect(musicAction(ok)).toBe('none'));
  it('restarts the song if iOS paused it', () => expect(musicAction({ ...ok, songPaused: true })).toBe('play'));
  it('nudges a stuck song, then reloads it', () => {
    expect(musicAction({ ...ok, stuckFor: STUCK_PLAY_AFTER })).toBe('play');
    expect(musicAction({ ...ok, stuckFor: STUCK_RELOAD_AFTER })).toBe('reload');
  });
  it('resumes an interrupted or suspended AudioContext (sound effects, chiptune)', () => {
    expect(musicAction({ ...ok, ctxState: 'interrupted' })).toBe('resume-ctx');
    expect(musicAction({ ...ok, ctxState: 'suspended', usingSong: false })).toBe('resume-ctx');
  });
  it('leaves the music alone when the game paused it or no run is on', () => {
    expect(musicAction({ ...ok, want: false, songPaused: true, ctxState: 'suspended' })).toBe('none');
  });
});

describe('debug overlay toggle', () => {
  it('toggles on 5 taps within the window, not on slower taps', () => {
    let taps: number[] = [];
    let toggled = 0;
    for (let i = 0; i < TAPS_TO_TOGGLE; i++) {
      const r = registerTap(taps, 1000 + i * 300);
      taps = r.taps;
      if (r.toggle) toggled++;
    }
    expect(toggled).toBe(1);
    taps = [];
    toggled = 0;
    for (let i = 0; i < 10; i++) {
      const r = registerTap(taps, i * (TAP_WINDOW / 3));
      taps = r.taps;
      if (r.toggle) toggled++;
    }
    expect(toggled).toBe(0);
  });
});

describe('bus drawing optimisations', () => {
  const poses = () => {
    const out = [];
    const bus = new Bus();
    for (const script of [[-1], [1], [-1, -1], [1, 1], [1, -1]]) {
      bus.target = bus.pos = 1;
      let k = 0;
      for (let i = 0; i < 80; i++) {
        if (i % 6 === 0 && k < script.length) bus.move(script[k++] as -1 | 1);
        bus.update(1 / 120);
        out.push(busPose({
          laneY: laneY(bus.pos), limits: busLimits(laneY, bus.pos, bus.target), d: i * 5, moveDir: bus.moveDir,
          moveProgress: bus.moveProgress, sinceArrival: bus.sinceArrival, live: true, now: i / 60,
        }));
      }
    }
    return out;
  };

  it('the fast extent matches a brute-force one in every pose', () => {
    for (const p of poses()) {
      const cols = busColumns(p, BUS_X);
      const wheels = busWheels(p, BUS_X);
      const r = BUS_WHEELS.r;
      const brute = {
        top: Math.min(...cols.map((c) => c.dy)),
        bottom: Math.max(
          ...cols.map((c) => c.dy + c.dh - 1), ...wheels.map((w) => w.y + r),
          frontCharmAnchor(p, BUS_X).y + FRONT_CHARM.h - 1, // room reserved for the front charm
        ),
        left: Math.min(...cols.map((c) => c.dx), ...wheels.map((w) => w.x - r)),
        right: Math.max(...cols.map((c) => c.dx + c.dw - 1), ...wheels.map((w) => w.x + r)),
      };
      expect(busExtent(p, BUS_X)).toEqual(brute);
    }
  });

  it('column groups cover exactly the same pixels as per-column drawing, in at most 4 draws', () => {
    for (const p of poses()) {
      const groups = busGroups(p, BUS_X);
      expect(groups.length).toBeLessThanOrEqual(4);
      if (p.tilt === 0) expect(groups.length).toBe(1);
      const cols = busColumns(p, BUS_X);
      const left = Math.min(...cols.map((c) => c.dx));
      const right = Math.max(...cols.map((c) => c.dx + c.dw));
      expect(groups[0].dx).toBe(left);
      expect(groups[groups.length - 1].dx + groups[groups.length - 1].dw).toBe(right);
      for (const g of groups) {
        expect(g.dh).toBe(Math.round(BUS_BODY_H * p.scaleY));
        // every source column inside the group has the same top as the group
        for (const c of cols.filter((c) => c.sx >= g.sx && c.sx < g.sx + g.sw)) expect(c.dy).toBe(g.dy);
      }
      expect(groups.reduce((n, g) => n + g.sw, 0)).toBeLessThanOrEqual(BUS_W);
    }
  });
});

describe('render interpolation', () => {
  it('keeps the previous distance and bus position for smooth drawing between 60 Hz steps', () => {
    const w = new World(1);
    w.step(1 / 60);
    const d1 = w.d;
    w.move(1);
    w.step(1 / 60);
    expect(w.prevD).toBe(d1);
    expect(w.d).toBeGreaterThan(w.prevD);
    expect(w.bus.prevPos).toBe(1);
    expect(w.bus.pos).toBeGreaterThan(1);
  });
});
