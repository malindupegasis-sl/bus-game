/**
 * Dham Rajina Xpress knockouts: while boosted, the bus knocks vehicles off the road instead of
 * passing through them. A knocked vehicle is removed from the traffic at once (it can't hit the
 * bus or block a lane any more); what's left is a purely visual animation.
 */
export const KNOCKOUT_POINTS = 25;
/** Knockouts within this many seconds of each other build a combo (x2, x3, ...). */
export const COMBO_WINDOW = 2;

/** What the politician shouts once his convoy has been scattered. */
export const SUE_LINES = ["I'LL SUE!!", 'MY LAWYER!!', 'WHO DID THIS?!'] as const;

export interface Combo {
  count: number;
  lastT: number;
}

export const newCombo = (): Combo => ({ count: 0, lastT: -Infinity });

/** Register a knockout at play time t; returns the combo count after it (1 = no combo yet). */
export function bumpCombo(c: Combo, t: number): number {
  c.count = t - c.lastT <= COMBO_WINDOW ? c.count + 1 : 1;
  c.lastT = t;
  return c.count;
}
