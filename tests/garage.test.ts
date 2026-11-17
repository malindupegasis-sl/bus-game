import { describe, expect, it } from 'vitest';
import { TRANSITION_TIME } from '../src/game/charm';
import {
  COLOURS, DEFAULT_STYLE, FIELD_LABELS, LIGHTS, OPTIONS, SIGNS, STICKERS, STYLE_KEY, cycle, effectiveLook, loadStyle,
  optionKeys, optionName, saveStyle, type BusStyle, type StyleField,
} from '../src/game/garage';
import { Game } from '../src/game/game';
import { BUS_SKINS, PALETTE, SPRITES } from '../src/render/sprites';

function memory(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}
const FIELDS = Object.keys(FIELD_LABELS) as StyleField[];

describe('garage options', () => {
  it('offers bus colours plus sign board, lights and sticker decorations', () => {
    expect(Object.keys(COLOURS).length).toBeGreaterThanOrEqual(5);
    expect(Object.keys(SIGNS).length).toBeGreaterThanOrEqual(3);
    expect(Object.keys(LIGHTS).length).toBeGreaterThanOrEqual(3);
    expect(Object.keys(STICKERS).length).toBeGreaterThanOrEqual(3);
    expect(FIELDS).toEqual(['colour', 'sign', 'lights', 'stickers']);
    for (const f of FIELDS) for (const k of optionKeys(f)) expect(optionName({ ...DEFAULT_STYLE, [f]: k } as BusStyle, f)).toMatch(/^[A-Z0-9 ]+$/);
  });

  it('every option cycles forwards and backwards and wraps around', () => {
    for (const f of FIELDS) {
      const keys = optionKeys(f);
      let st: BusStyle = { ...DEFAULT_STYLE };
      const seen: string[] = [];
      for (let i = 0; i < keys.length; i++) {
        seen.push(st[f] as string);
        st = cycle(st, f, 1);
      }
      expect(new Set(seen).size).toBe(keys.length);
      expect(st[f]).toBe(DEFAULT_STYLE[f]); // wrapped
      expect(cycle(cycle(st, f, 1), f, -1)).toEqual(st);
      expect(cycle(DEFAULT_STYLE, f, -1)[f]).toBe(keys[keys.length - 1]);
      // other fields untouched
      for (const g of FIELDS) if (g !== f) expect(cycle(DEFAULT_STYLE, f, 1)[g]).toBe(DEFAULT_STYLE[g]);
    }
  });

  it('colour presets only recolour parts of the bus that exist, and never look like a rival bus', () => {
    const used = new Set(SPRITES.bus.join(''));
    for (const c of Object.values(COLOURS)) {
      for (const k of Object.keys(c.pal)) {
        expect(PALETTE[k], k).toBeDefined();
        expect(used.has(k), `bus uses '${k}'`).toBe(true);
      }
      expect(c.pal).not.toEqual(expect.objectContaining({ R: BUS_SKINS.rival.R }));
    }
    for (const sign of Object.values(SIGNS)) expect(sign.glow).toHaveLength(4);
  });
});

describe('garage saving (on the device)', () => {
  it('round-trips the chosen look', () => {
    const s = memory();
    const st: BusStyle = { colour: 'sunset', sign: 'scroll', lights: 'rainbow', stickers: 'flames' };
    saveStyle(st, s);
    expect(JSON.parse(s.m.get(STYLE_KEY)!)).toEqual(st);
    expect(loadStyle(s)).toEqual(st);
  });

  it('falls back safely: nothing saved, broken JSON, unknown or missing values, blocked storage', () => {
    expect(loadStyle(memory())).toEqual(DEFAULT_STYLE);
    expect(loadStyle(memory({ [STYLE_KEY]: '{not json' }))).toEqual(DEFAULT_STYLE);
    expect(loadStyle(memory({ [STYLE_KEY]: JSON.stringify({ colour: 'emerald', sign: 'hologram', lights: 3 }) }))).toEqual({
      ...DEFAULT_STYLE, colour: 'emerald',
    });
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
    expect(loadStyle(blocked)).toEqual(DEFAULT_STYLE);
    expect(() => saveStyle(DEFAULT_STYLE, blocked)).not.toThrow();
    expect(loadStyle(null)).toEqual(DEFAULT_STYLE);
  });
});

describe('garage screen', () => {
  it('opens only from the start menu and goes back to it', () => {
    const g = new Game(0, 1);
    expect(g.openGarage()).toBe(true);
    expect(g.phase).toBe('garage');
    expect(g.openGarage()).toBe(false);
    expect(g.closeGarage()).toBe(true);
    expect(g.phase).toBe('title');
    g.start();
    expect(g.openGarage()).toBe(false); // not mid-run
  });

  it("taps, swipes and arrow presses in the garage don't start a run", () => {
    const g = new Game(0, 1);
    g.openGarage();
    expect(g.tap()).toBe('none');
    expect(g.press(1)).toBe('none');
    expect(g.swipe(1)).toBe(false);
    g.update(1);
    expect(g.phase).toBe('garage');
    expect(g.primary()).toBe('none'); // Enter/Space: back to the title
    expect(g.phase).toBe('title');
  });
});

describe('Dham Rajina Xpress overrides the garage look', () => {
  it('while boosted (and flickering back during the transition)', () => {
    expect(effectiveLook({ boostT: 5, transitionT: 0 }, 0.99, TRANSITION_TIME)).toBe('xpress');
    expect(effectiveLook({ boostT: 0, transitionT: 0 }, 0, TRANSITION_TIME)).toBe('custom');
    // Transition: mostly Xpress at the start, mostly custom at the end.
    const share = (t: number) => {
      let n = 0;
      for (let i = 0; i < 100; i++) if (effectiveLook({ boostT: 0, transitionT: t }, i / 100, TRANSITION_TIME) === 'xpress') n++;
      return n / 100;
    };
    expect(share(0.9)).toBeGreaterThan(0.8);
    expect(share(0.1)).toBeLessThan(0.2);
  });

  it('whatever the garage look is', () => {
    for (const colour of Object.keys(COLOURS)) {
      expect(effectiveLook({ boostT: 1, transitionT: 0 }, 0.5, TRANSITION_TIME)).toBe('xpress');
      void colour;
    }
    void OPTIONS;
  });
});
