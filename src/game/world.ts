import { BUS_X, DISTANCE_PER_POINT, laneY } from '../config';
import { Bus } from './bus';
import { CAPTIONS, OVERTAKE_BONUS, type CaptionKey } from './captions';
import {
  collect, invincible, knocksOff, newCharm, nextPickup, onHit, scoreMultiplier, speedMultiplier, tickCharm, type Charm,
  type CharmEvent,
} from './charm';
import { speedAt } from './difficulty';
import { BUS_HIT, KINDS, exitDistance, obstacleLane, obstacleX, type Obstacle } from './obstacles';
import { createPickupSpawner, pickupGone, pickupX, touches, updatePickups, type Pickup, type PickupSpawner } from './pickups';
import { createRng, type Rng } from './rng';
import { KNOCKOUT_POINTS, bumpCombo, newCombo } from './knockout';
import { createSpawner, updateSpawner, type SpawnerState } from './spawner';

export type WorldEvent =
  | { type: 'lane' }
  | { type: 'crash'; obstacle: Obstacle }
  | { type: 'charm'; what: CharmEvent }
  | { type: 'overtake'; bonus: number; obstacle: Obstacle }
  | { type: 'seen'; what: CaptionKey }
  | { type: 'pickup'; kind: 'chilli' | 'lime'; lane: number; x: number }
  | { type: 'knockout'; obstacle: Obstacle; x: number; lane: number; points: number; combo: number };

export interface WorldOptions {
  /** Chillies, limes, the charm and the boost. Off in the strict traffic-fairness tests. */
  pickups?: boolean;
}

/** One run of the game: pure simulation, no DOM. */
export class World {
  t = 0;
  d = 0;
  /** Distance at the previous fixed update (the renderer interpolates between the two). */
  prevD = 0;
  speed = speedAt(0);
  crashed = false;
  crashedWith: Obstacle | null = null;
  readonly bus = new Bus();
  obstacles: Obstacle[] = [];
  pickups: Pickup[] = [];
  readonly charm: Charm = newCharm();
  /** Distance counted for score (doubled while boosted) and bonus points (overtakes). */
  scoreDistance = 0;
  bonus = 0;
  /** Lucky-charm saves this run. */
  saves = 0;
  /** Vehicles knocked off the road this run (boost), and the current combo. */
  knockouts = 0;
  readonly combo = newCombo();
  readonly rng: Rng;
  private readonly withPickups: boolean;
  private spawner: SpawnerState = createSpawner();
  private pickupSpawner: PickupSpawner = createPickupSpawner();
  private events: WorldEvent[] = [];
  private seen = new Set<CaptionKey>();
  private overtaken = new Set<number>();

  constructor(seed = (Math.random() * 2 ** 32) >>> 0, opts: WorldOptions = {}) {
    this.rng = createRng(seed);
    this.withPickups = opts.pickups ?? true;
  }

  get score(): number {
    return Math.floor(this.scoreDistance / DISTANCE_PER_POINT) + this.bonus;
  }

  /** Multiplier hook kept for compatibility: the boost now comes from the charm. */
  get speedBoost(): number {
    return speedMultiplier(this.charm);
  }

  move(dir: -1 | 1): boolean {
    if (this.crashed) return false;
    const moved = this.bus.move(dir);
    if (moved) this.events.push({ type: 'lane' });
    return moved;
  }

  setBusTarget(lane: number): void {
    if (this.crashed) return;
    if (this.bus.setTarget(lane)) this.events.push({ type: 'lane' });
  }

  drainEvents(): WorldEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  private see(what: CaptionKey): void {
    if (this.seen.has(what) || !(what in CAPTIONS)) return;
    this.seen.add(what);
    this.events.push({ type: 'seen', what });
  }

  step(dt: number): void {
    this.prevD = this.d;
    this.bus.prevPos = this.bus.pos;
    if (this.crashed) return;
    this.t += dt;
    for (const what of tickCharm(this.charm, dt)) this.events.push({ type: 'charm', what });
    this.speed = speedAt(this.t) * speedMultiplier(this.charm);
    this.d += this.speed * dt;
    this.scoreDistance += this.speed * dt * scoreMultiplier(this.charm);
    this.bus.update(dt);

    const spawned = updateSpawner(this.spawner, {
      d: this.d, t: this.t, obstacles: this.obstacles, rng: this.rng, busLane: this.bus.target,
      pickups: this.withPickups ? this.pickups : undefined,
    });
    if (spawned) {
      this.obstacles.push(spawned);
      this.see(spawned.kind);
    }
    if (this.withPickups) {
      const p = updatePickups(this.pickupSpawner, {
        d: this.d, t: this.t, want: nextPickup(this.charm), pickups: this.pickups, obstacles: this.obstacles, rng: this.rng,
      });
      if (p) {
        this.pickups.push(p);
        this.see(p.kind);
      }
      for (const pk of this.pickups) {
        if (!touches(pk, this.d, this.bus.pos)) continue;
        pk.collected = true;
        this.events.push({ type: 'pickup', kind: pk.kind, lane: pk.lane, x: pickupX(pk, this.d) });
        for (const what of collect(this.charm, pk.kind)) this.events.push({ type: 'charm', what });
      }
      this.pickups = this.pickups.filter((pk) => !pickupGone(pk, this.d));
    }

    // Overtaking a rival: once it's fully behind the bus's rear.
    for (const o of this.obstacles) {
      if (o.kind !== 'rival' || this.overtaken.has(o.id)) continue;
      if (obstacleX(o, this.d) + KINDS.rival.width < BUS_X) {
        this.overtaken.add(o.id);
        this.bonus += OVERTAKE_BONUS;
        this.events.push({ type: 'overtake', bonus: OVERTAKE_BONUS, obstacle: o });
      }
    }
    this.obstacles = this.obstacles.filter((o) => this.d < exitDistance(o));

    // Every vehicle the boosted bus touches this step is knocked off (there can be several).
    let hit = this.findCollision();
    while (hit && knocksOff(this.charm)) {
      this.knockOff(hit);
      hit = this.findCollision();
    }
    if (hit) {
      const r = onHit(this.charm);
      if (r === 'saved') {
        this.saves++;
        this.events.push({ type: 'charm', what: 'saved' });
      } else if (r === 'crash') {
        this.crashed = true;
        this.crashedWith = hit;
        this.events.push({ type: 'crash', obstacle: hit });
      }
    }
  }

  /** Remove a vehicle from the road at once and score the knockout (doubled while boosted). */
  private knockOff(o: Obstacle): void {
    this.obstacles = this.obstacles.filter((x) => x !== o);
    this.knockouts++;
    const combo = bumpCombo(this.combo, this.t);
    const points = KNOCKOUT_POINTS * scoreMultiplier(this.charm);
    this.bonus += points;
    this.events.push({ type: 'knockout', obstacle: o, x: obstacleX(o, this.d), lane: obstacleLane(o, this.d), points, combo });
  }

  get invincible(): boolean {
    return invincible(this.charm);
  }

  findCollision(): Obstacle | null {
    const busY = laneY(this.bus.pos);
    const bL = BUS_X + BUS_HIT.x0;
    const bR = BUS_X + BUS_HIT.x1;
    for (const o of this.obstacles) {
      const k = KINDS[o.kind];
      const x = obstacleX(o, this.d);
      if (x + k.hitX1 <= bL || x + k.hitX0 >= bR) continue;
      const y = laneY(obstacleLane(o, this.d));
      if (Math.abs(y - busY) < BUS_HIT.halfH + k.halfH) return o;
    }
    return null;
  }
}
