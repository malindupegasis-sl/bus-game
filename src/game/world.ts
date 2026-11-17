import { BUS_X, laneY } from '../config';
import { Bus } from './bus';
import { speedAt } from './difficulty';
import { BUS_HIT, KINDS, exitDistance, obstacleLane, obstacleX, type Obstacle } from './obstacles';
import { createRng, type Rng } from './rng';
import { scoreFromDistance } from './score';
import { createSpawner, updateSpawner, type SpawnerState } from './spawner';

export type WorldEvent = { type: 'lane' } | { type: 'crash'; obstacle: Obstacle };

/** One run of the game: pure simulation, no DOM. */
export class World {
  t = 0;
  d = 0;
  /** Distance at the previous fixed update (the renderer interpolates between the two). */
  prevD = 0;
  speed = speedAt(0);
  /** Multiplier hook for future boosts (conductor shout → party bus). */
  speedBoost = 1;
  crashed = false;
  crashedWith: Obstacle | null = null;
  readonly bus = new Bus();
  obstacles: Obstacle[] = [];
  readonly rng: Rng;
  private spawner: SpawnerState = createSpawner();
  private events: WorldEvent[] = [];

  constructor(seed = (Math.random() * 2 ** 32) >>> 0) {
    this.rng = createRng(seed);
  }

  get score(): number {
    return scoreFromDistance(this.d);
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

  step(dt: number): void {
    this.prevD = this.d;
    this.bus.prevPos = this.bus.pos;
    if (this.crashed) return;
    this.t += dt;
    this.speed = speedAt(this.t) * this.speedBoost;
    this.d += this.speed * dt;
    this.bus.update(dt);

    const spawned = updateSpawner(this.spawner, {
      d: this.d, t: this.t, obstacles: this.obstacles, rng: this.rng, busLane: this.bus.target,
    });
    if (spawned) this.obstacles.push(spawned);
    this.obstacles = this.obstacles.filter((o) => this.d < exitDistance(o));

    const hit = this.findCollision();
    if (hit) {
      this.crashed = true;
      this.crashedWith = hit;
      this.events.push({ type: 'crash', obstacle: hit });
    }
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
