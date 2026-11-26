import { describe, expect, it } from 'vitest';
import { COUNT_TIME, PRINT_DELAY, PRINT_TIME, TicketCounter } from '../src/render/ticket';
import { ticketsLabel } from '../src/share';

const run = (c: TicketCounter, s: number) => { for (let t = 0; t < s; t += 1 / 60) c.update(1 / 60); };

describe('ticket counter', () => {
  it('first visit: the ticket slides out with the real total, no counting, never a fake +1', () => {
    const c = new TicketCounter();
    c.show(3195, null);
    expect(c.value).toBe(3195);
    expect(c.out).toBe(0);
    run(c, PRINT_DELAY + PRINT_TIME / 2);
    expect(c.out).toBeGreaterThan(0.3);
    expect(c.out).toBeLessThan(0.8);
    expect(c.value).toBe(3195);
    run(c, PRINT_TIME);
    expect(c.out).toBe(1);
    expect(c.busy).toBe(false);
  });

  it('a returning phone prints the total it saw last time, then counts up to the real one', () => {
    const c = new TicketCounter();
    c.show(3195, 3150);
    run(c, PRINT_DELAY + PRINT_TIME);
    expect(c.value).toBe(3150); // fully out, still showing what this phone saw
    const seen: number[] = [];
    for (let i = 0; i < (COUNT_TIME + 0.2) * 60; i++) { c.update(1 / 60); seen.push(c.value!); }
    expect(seen[seen.length - 1]).toBe(3195);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen); // only ever goes up
    expect(c.busy).toBe(false);
  });

  it('same total as last time: no movement at all; a lower or junk "seen" is ignored', () => {
    const c = new TicketCounter();
    c.show(3195, 3195);
    run(c, 3);
    expect(c.value).toBe(3195);
    const d = new TicketCounter();
    d.show(3195, 9999);
    expect(d.value).toBe(3195);
  });

  it('a higher refresh counts up on the ticket already out; lower is ignored; hide clears it', () => {
    const c = new TicketCounter();
    c.show(100, null);
    run(c, 2);
    c.raise(140);
    run(c, 0.1);
    expect(c.value).toBeGreaterThan(100);
    expect(c.value).toBeLessThan(140);
    expect(c.busy).toBe(true);
    run(c, COUNT_TIME);
    expect(c.value).toBe(140);
    c.raise(120);
    expect(c.value).toBe(140);
    c.hide();
    expect(c.value).toBeNull();
  });

  it('wording', () => {
    expect(ticketsLabel(3195)).toBe('3,195 tickets issued');
    expect(ticketsLabel(1)).toBe('1 ticket issued');
    expect(ticketsLabel(1234567)).toBe('1,234,567 tickets issued');
  });
});
