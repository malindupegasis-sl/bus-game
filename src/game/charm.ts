/**
 * Lime-and-chilli charm and the Dham Rajina Xpress boost.
 *
 *   0 chillies ─chilli→ 1 ─chilli→ 2 (charm hangs on the bus; a lime can now appear)
 *   2 ─lime→ BOOST (11 s: invincible, road 1.3x, double score) → TRANSITION (1 s, still
 *   invincible, speed eases back) → 0 (charm comes off, collecting starts again)
 *
 * Lucky charm: while the 2-chilli charm hangs (before the lime), it saves the player from one
 * crash. The charm falls off, the bus blinks for 1.5 s of invincibility, and collecting restarts.
 */
export const BOOST_TIME = 11; // v2 feedback: 5 s longer than the first 6 s
export const TRANSITION_TIME = 1;
export const SAVE_INVINCIBLE_TIME = 1.5;
export const BOOST_SPEED = 1.3;
export const BOOST_SCORE = 2;

export interface Charm {
  chillies: 0 | 1 | 2;
  boostT: number;
  transitionT: number;
  invincibleT: number;
}

export type CharmEvent = 'chilli' | 'charmHung' | 'boostStart' | 'boostEnd' | 'boostOver' | 'saved';

export function newCharm(): Charm {
  return { chillies: 0, boostT: 0, transitionT: 0, invincibleT: 0 };
}

export const boosting = (c: Charm) => c.boostT > 0;
export const inTransition = (c: Charm) => c.transitionT > 0;
/** The charm is hanging on the bus: 2 chillies, or the complete charm during the boost. */
export const charmHanging = (c: Charm) => c.chillies === 2;
export const invincible = (c: Charm) => c.boostT > 0 || c.transitionT > 0 || c.invincibleT > 0;

/** Which pickup the road should offer next (null: none right now). */
export function nextPickup(c: Charm): 'chilli' | 'lime' | null {
  if (boosting(c) || inTransition(c)) return null;
  return c.chillies < 2 ? 'chilli' : 'lime';
}

export function collect(c: Charm, kind: 'chilli' | 'lime'): CharmEvent[] {
  if (boosting(c) || inTransition(c)) return [];
  if (kind === 'chilli' && c.chillies < 2) {
    c.chillies = (c.chillies + 1) as 1 | 2;
    return c.chillies === 2 ? ['chilli', 'charmHung'] : ['chilli'];
  }
  if (kind === 'lime' && c.chillies === 2) {
    c.boostT = BOOST_TIME;
    return ['boostStart'];
  }
  return [];
}

export function tickCharm(c: Charm, dt: number): CharmEvent[] {
  const ev: CharmEvent[] = [];
  if (c.invincibleT > 0) c.invincibleT = Math.max(0, c.invincibleT - dt);
  if (c.boostT > 0) {
    c.boostT -= dt;
    if (c.boostT <= 0) {
      c.boostT = 0;
      c.transitionT = TRANSITION_TIME;
      c.chillies = 0; // the charm comes off; collecting starts again
      ev.push('boostEnd');
    }
  } else if (c.transitionT > 0) {
    c.transitionT -= dt;
    if (c.transitionT <= 0) {
      c.transitionT = 0;
      ev.push('boostOver');
    }
  }
  return ev;
}

/** The boost (and its transition back) knocks vehicles off the road. */
export const knocksOff = (c: Charm) => c.boostT > 0 || c.transitionT > 0;

/**
 * A collision happened: knock the vehicle off (boosted), ignore it (lucky-charm blink), save it
 * (charm), or it's a crash.
 */
export function onHit(c: Charm): 'knockout' | 'ignored' | 'saved' | 'crash' {
  if (knocksOff(c)) return 'knockout';
  if (invincible(c)) return 'ignored';
  if (c.chillies === 2) {
    c.chillies = 0;
    c.invincibleT = SAVE_INVINCIBLE_TIME;
    return 'saved';
  }
  return 'crash';
}

/** Road speed multiplier: 1.3x while boosted, easing back to 1x over the transition. */
export function speedMultiplier(c: Charm): number {
  if (c.boostT > 0) return BOOST_SPEED;
  if (c.transitionT > 0) return 1 + (BOOST_SPEED - 1) * (c.transitionT / TRANSITION_TIME);
  return 1;
}

export const scoreMultiplier = (c: Charm) => (c.boostT > 0 ? BOOST_SCORE : 1);
