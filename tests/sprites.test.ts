import { describe, expect, it } from 'vitest';
import { KINDS } from '../src/game/obstacles';
import { BUS_SKINS, FONT, PALETTE, PALM, SPRITES } from '../src/render/sprites';

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
    for (const [kind, spec] of Object.entries(KINDS)) {
      const rows = SPRITES[kind as keyof typeof SPRITES];
      expect(rows[0].length, kind).toBe(spec.width);
      expect(rows.length, kind).toBe(spec.height);
      expect(spec.hitX0).toBeGreaterThan(0);
      expect(spec.hitX1).toBeLessThan(spec.width);
    }
    expect(SPRITES.bus[0].length).toBe(48);
  });

  it('skins only override existing palette keys', () => {
    for (const skin of Object.values(BUS_SKINS)) for (const k of Object.keys(skin)) expect(PALETTE[k]).toBeDefined();
  });

  it('font covers digits, letters and the punctuation the game uses', () => {
    for (const ch of '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ ,.!/:') expect(FONT[ch], ch).toHaveLength(15);
  });
});
