import { describe, expect, it } from 'vitest';
import { KINDS } from '../src/game/obstacles';
import { BUS_SKINS, FONT_BIG, FONT_SMALL, PALETTE, PALM, SPRITES, type Font } from '../src/render/sprites';
import { GAME_TITLE, MUSIC_CREDIT } from '../src/config';
import { START, UI_RECTS } from '../src/ui-layout';

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
        // Lowercase descenders (g j p q y) and the comma hang below the baseline.
        expect(g.h, ch).toBe(font === FONT_BIG && 'gjpqy,'.includes(ch) ? h + 2 : h);
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

  it('the title fits on one line, clear of the mute button, above the counter', () => {
    const width = (f: Font, s: string, scale: number) => ([...s].reduce((w, c) => w + f[c].w + 1, 0) - 1) * scale;
    const w = width(FONT_BIG, GAME_TITLE, 2) + 2; // 2x font plus its 2px shadow
    const x0 = Math.min(Math.round((256 - w) / 2), UI_RECTS.mute.x - 6 - 2 - w);
    expect(x0).toBeGreaterThanOrEqual(4);
    expect(Math.abs(x0 + w / 2 - 128)).toBeLessThanOrEqual(6); // still (nearly) centred
    expect(x0 + w).toBeLessThanOrEqual(UI_RECTS.mute.x - 6 - 2); // clear of the mute tap area
    expect(START.titleY + 7 * 2 + 2).toBeLessThan(START.counterY);
    expect(MUSIC_CREDIT).toBe('Nandana Sihina Gange - Sangeeth Wijesuriya');
  });
});

describe('5×7 lowercase', () => {
  it('a-z all present; 7 rows, or 9 for descenders; rows the same width', async () => {
    const { FONT_BIG } = await import('../src/render/sprites');
    for (const ch of 'abcdefghijklmnopqrstuvwxyz') {
      const g = FONT_BIG[ch];
      expect(g, ch).toBeDefined();
      expect(g.h, ch).toBe('gjpqy'.includes(ch) ? 9 : 7);
      expect(g.bits.length, ch).toBe(g.w * g.h);
    }
    for (const ch of 'Played 1,234 times') expect(FONT_BIG[ch], ch).toBeDefined();
  });
});
