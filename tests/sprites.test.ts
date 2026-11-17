import { describe, expect, it } from 'vitest';
import { KINDS } from '../src/game/obstacles';
import { BUS_SKINS, FONT_BIG, FONT_SMALL, PALETTE, PALM, SPRITES, type Font } from '../src/render/sprites';
import { GAME_TITLE, MUSIC_CREDIT } from '../src/config';
import { splitTitle } from '../src/render/renderer';

describe('sprites', () => {
  it('every sprite is rectangular and only uses palette colours', () => {
    for (const [name, rows] of Object.entries(SPRITES)) {
      const w = rows[0].length;
      for (const row of rows) {
        expect(row.length, name).toBe(w);
        for (const ch of row) if (ch !== '.') expect(PALETTE[ch], `${name} uses '${ch}'`).toBeDefined();
      }
    }
    expect(new Set(PALM.map((r) => r.length)).size).toBe(1);
  });

  it('obstacle sprite sizes match their specs and hitboxes sit inside the sprite', () => {
    // The convoy (5 SUVs) and the rival (bus body + wheels) are drawn from other sprites.
    expect(KINDS.convoy.width).toBe(5 * SPRITES.suv[0].length + 4 * 2);
    expect(KINDS.rival.width).toBe(SPRITES.bus[0].length);
    for (const [kind, spec] of Object.entries(KINDS)) {
      if (kind === 'convoy' || kind === 'rival') continue;
      const rows = SPRITES[kind as keyof typeof SPRITES];
      expect(rows[0].length, kind).toBe(spec.width);
      expect(rows.length, kind).toBe(spec.height);
      expect(spec.hitX0).toBeGreaterThan(0);
      expect(spec.hitX1).toBeLessThan(spec.width);
    }
    expect(SPRITES.bus[0].length).toBe(74);
  });

  it('skins only override existing palette keys', () => {
    for (const skin of Object.values(BUS_SKINS)) for (const k of Object.keys(skin)) expect(PALETTE[k]).toBeDefined();
  });

  const key = (f: Font, ch: string) => `${f[ch].w}:${f[ch].bits.map(Number).join('')}`;

  it('both fonts have consistent glyph sizes and cover everything the game prints', () => {
    for (const [font, h] of [[FONT_SMALL, 5], [FONT_BIG, 7]] as const) {
      for (const [ch, g] of Object.entries(font)) {
        expect(g.h, ch).toBe(h);
        expect(g.bits).toHaveLength(g.w * g.h);
      }
    }
    const printed = `0123456789 ABCDEFGHIJKLMNOPQRSTUVWXYZ,.!/:- ${MUSIC_CREDIT.toUpperCase()}`;
    for (const ch of printed) expect(FONT_SMALL[ch], `small '${ch}'`).toBeDefined();
    for (const ch of `${GAME_TITLE} GAME OVER PAUSED NEW BEST!`) expect(FONT_BIG[ch], `big '${ch}'`).toBeDefined();
  });

  it('every letter is unique in both fonts (M, N, W, Z no longer look like H or each other)', () => {
    for (const font of [FONT_SMALL, FONT_BIG]) {
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('').filter((c) => !(font === FONT_SMALL && 'O0'.includes(c)));
      const seen = new Map<string, string>();
      for (const ch of letters) {
        const k = key(font, ch);
        expect(seen.get(k), `'${ch}' looks identical to '${seen.get(k)}'`).toBeUndefined();
        seen.set(k, ch);
      }
    }
    // The problem letters are wider than the 3px default in the small font.
    for (const ch of 'MNWZ') expect(FONT_SMALL[ch].w).toBeGreaterThan(3);
  });

  it('title and credit fit on the 256px screen', () => {
    const width = (f: Font, s: string, scale: number) => ([...s].reduce((w, c) => w + f[c].w + 1, 0) - 1) * scale;
    const [a, b] = splitTitle(GAME_TITLE);
    expect([a, b]).toEqual(['LANKAN BUS', 'LEGENDZ']);
    expect(width(FONT_BIG, a, 3)).toBeLessThanOrEqual(256 - 8);
    expect(width(FONT_SMALL, MUSIC_CREDIT.toUpperCase(), 1)).toBeLessThanOrEqual(256 - 8);
  });
});
