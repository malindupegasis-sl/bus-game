import { describe, expect, it } from 'vitest';
import { APPEAR_DELAY, FLIP_TIME, FlipCounter, MAX_STEPS } from '../src/render/flip';

const run = (c: FlipCounter, s: number) => { for (let t = 0; t < s; t += 1 / 60) c.update(1 / 60); };
const text = (c: FlipCounter) => c.tiles().map((t) => t.to).join('');

describe('flip counter', () => {
  it('on appearing shows N-1, waits a moment, then flips only the changed digits to N', () => {
    const c = new FlipCounter();
    c.appear(2400);
    expect(text(c)).toBe('2399');
    expect(c.tiles().every((t) => t.p === 1)).toBe(true);
    run(c, APPEAR_DELAY + FLIP_TIME / 2); // mid-flip
    const t = c.tiles();
    expect(t.map((x) => x.to).join('')).toBe('2400');
    expect(t.map((x) => x.from).join('')).toBe('2399');
    expect(t.filter((x) => x.p < 1).map((x) => x.to)).toEqual(['4', '0', '0']); // 3 tiles flip
    run(c, FLIP_TIME);
    expect(c.busy).toBe(false);
    expect(c.shown).toBe(2400);
  });

  it('a higher refresh flips through every number, a big jump in at most 12 steps, landing exactly', () => {
    const c = new FlipCounter();
    c.appear(100);
    run(c, 2);
    c.raise(105);
    const seen: number[] = [c.shown!];
    for (let i = 0; i < 400; i++) { c.update(1 / 60); if (seen[seen.length - 1] !== c.shown) seen.push(c.shown!); }
    expect(seen).toEqual([100, 101, 102, 103, 104, 105]);
    c.raise(1234);
    let steps = 0, last = c.shown;
    for (let i = 0; i < 600; i++) { c.update(1 / 60); if (c.shown !== last) { steps++; last = c.shown; } }
    expect(steps).toBe(MAX_STEPS);
    expect(c.shown).toBe(1234);
    expect(text(c)).toBe('1234');
  });

  it('never goes down; a new digit appears as a blank tile flipping in; hide clears it', () => {
    const c = new FlipCounter();
    c.appear(1000);
    expect(text(c)).toBe(' 999');
    run(c, 1);
    expect(text(c)).toBe('1000');
    c.raise(900);
    run(c, 1);
    expect(c.shown).toBe(1000);
    c.hide();
    expect(c.tiles()).toEqual([]);
    c.appear(1);
    expect(text(c)).toBe('0');
  });
});
