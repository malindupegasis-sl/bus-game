/**
 * Obstacle kinds and their motion.
 *
 * Positions are functions of the distance the bus has travelled (`d`, logical px), not of time.
 * An obstacle's on-screen speed is `speedFactor × bus speed`, so the spawner can reason about
 * fairness in distance space and stay correct as the game speeds up.
 *
 * To add a new kind (politician's convoy, rival bus, ...): add it to ObstacleKind and KINDS,
 * give it a sprite in render/sprites.ts and a spawn weight in difficulty.ts.
 */
export type ObstacleKind = 'lorry' | 'tuktuk' | 'bike';

export interface KindSpec {
  /** Sprite size (px). */
  width: number;
  height: number;
  /** Hitbox x-range relative to the sprite's left edge (smaller than the sprite on purpose). */
  hitX0: number;
  hitX1: number;
  /** Hitbox half-height around the lane centre line. */
  halfH: number;
  /** On-screen leftward speed as a multiple of bus speed. */
  speedFactor: readonly [min: number, max: number];
}

export const KINDS: Record<ObstacleKind, KindSpec> = {
  // Oncoming, fast and straight.
  lorry: { width: 46, height: 22, hitX0: 3, hitX1: 43, halfH: 7, speedFactor: [1.6, 1.85] },
  // Oncoming. About half swerve one lane, once, in the right half of the screen, after a long tell.
  tuktuk: { width: 24, height: 20, hitX0: 3, hitX1: 21, halfH: 6, speedFactor: [1.15, 1.3] },
  // Same direction as the bus, so it closes slowly and blocks a lane for longer.
  bike: { width: 34, height: 26, hitX0: 4, hitX1: 30, halfH: 6, speedFactor: [0.42, 0.5] },
};

/**
 * Bus hitbox, relative to the bus sprite's left edge at BUS_X. The sprite is 62×27 (30% bigger
 * than v1.1's 48×22); the hitbox keeps v1.1's proportions: ~84% of the length, about two thirds
 * of the height, so near misses still feel fair.
 */
export const BUS_HIT = { x0: 5, x1: 57, halfH: 9 } as const;
export const BUS_SPRITE_W = 62;

/** Tuk-tuk swerve rules (seconds are at the speed it spawned at). */
export const TUK_TELL_TIME = 0.7; // blinker + hop before the swerve
/**
 * At high speed a tuk-tuk crosses the screen in well under a second, so a fully visible 0.7s tell
 * plus a right-half swerve doesn't fit. The tell then shortens to what fits, but never below this (0.42s fits every tuk-tuk at top speed);
 * if even this doesn't fit, that tuk-tuk stays in its lane.
 */
export const TUK_MIN_TELL_TIME = 0.42;
export const TUK_SWERVE_TIME = 0.28;
/** Chance a new tuk-tuk plans a swerve. 0.6 because the fairness check rejects swerving tuk-tuks
 *  more often (they occupy two lanes); the share that actually swerves on the road is ~50%. */
export const TUK_SWERVE_CHANCE = 0.6;
/** The tell only starts once at least half the tuk-tuk is on screen (sprite-left x). */
export const TUK_TELL_MAX_X = 256 - 12;
/** The swerve must start while the tuk-tuk's centre is still in the right half (sprite-left x). */
export const TUK_SWERVE_MIN_X = 128 - 12;

export interface Obstacle {
  id: number;
  kind: ObstacleKind;
  /** Distance at which it spawned, and its screen x (sprite left edge) at that moment. */
  d0: number;
  x0: number;
  /** Screen pixels moved left per unit of bus distance. */
  f: number;
  lane: number;
  /** Lane after a swerve. Equals `lane` for non-swerving kinds. */
  toLane: number;
  /** Distances when the tell starts, the swerve starts and the swerve ends (Infinity if none). */
  dTell: number;
  dSwerve: number;
  dSwerveEnd: number;
}

export function obstacleX(o: Obstacle, d: number): number {
  return o.x0 - o.f * (d - o.d0);
}

const smooth = (x: number) => x * x * (3 - 2 * x);

/** Fractional lane at distance d (tuk-tuks glide between lanes while swerving). */
export function obstacleLane(o: Obstacle, d: number): number {
  if (d <= o.dSwerve) return o.lane;
  if (d >= o.dSwerveEnd) return o.toLane;
  const p = (d - o.dSwerve) / (o.dSwerveEnd - o.dSwerve);
  return o.lane + (o.toLane - o.lane) * smooth(p);
}

export function isTelling(o: Obstacle, d: number): boolean {
  return d >= o.dTell && d < o.dSwerve;
}

/** Distance at which the obstacle has fully left the screen on the left. */
export function exitDistance(o: Obstacle, margin = 16): number {
  return o.d0 + (o.x0 + KINDS[o.kind].width + margin) / o.f;
}
