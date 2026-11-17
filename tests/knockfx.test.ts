import { describe, expect, it } from 'vitest';
import { LANE_CENTER_Y, VIEW_W } from '../src/config';
import { KnockFx, MAX_PARTICLES, MAX_WRECKS, SHAKE_TIME, SPIN_FRAMES, TIP_FRAMES, spinFrame, tipFrame, type WreckKind } from '../src/render/knockFx';

const DT = 1 / 60;
const SPEED = 150;

describe('knock-off effects', () => {
  it('every kind leaves the screen quickly (a lorry or bike parks on the verge and scrolls away)', () => {
    for (const kind of ['lorry', 'tuktuk', 'bike', 'suv', 'rival'] as WreckKind[]) {
      for (const y of LANE_CENTER_Y) {
        const fx = new KnockFx();
        const w = fx.spawn(kind, 1, 60, y, -SPEED, SPEED, 'X');
        let t = 0;
        while (w.alive && t < 10) {
          fx.update(DT, SPEED);
          t += DT;
        }
        expect(w.alive, `${kind} lane y=${y}`).toBe(false);
        expect(t, `${kind} lane y=${y}`).toBeLessThan(kind === 'lorry' || kind === 'bike' ? 2 : 1.5);
      }
    }
  });

  it('the tuk-tuk flies off the top, spinning; the rival slides off backwards; a convoy scatters both ways', () => {
    const fx = new KnockFx();
    const tuk = fx.spawn('tuktuk', 2, 100, 60, -SPEED, SPEED);
    const rival = fx.spawn('rival', 3, 100, 60, -SPEED, SPEED);
    const suvs = [0, 1, 2, 3, 4].map((i) => fx.spawn('suv', 4, 60 + i * 34, 60, -SPEED, SPEED, '', i, 5));
    fx.update(0.1, SPEED);
    expect(tuk.vy).toBeLessThan(0);
    expect(tuk.ang).toBeGreaterThan(1);
    expect(rival.vx).toBeLessThan(-SPEED);
    expect(suvs[0].vy).toBeLessThan(0);
    expect(suvs[4].vy).toBeGreaterThan(0);
  });

  it('the lorry tips over, then throws dust and cargo once; the bike only swerves onto the verge', () => {
    const fx = new KnockFx();
    const lorry = fx.spawn('lorry', 5, 120, LANE_CENTER_Y[2], -SPEED * 1.6, SPEED);
    expect(tipFrame(lorry.ang)).toBe(0);
    for (let i = 0; i < 30; i++) fx.update(DT, SPEED);
    expect(tipFrame(lorry.ang)).toBe(TIP_FRAMES - 1);
    const n = fx.particleCount;
    expect(n).toBeGreaterThan(10);
    for (let i = 0; i < 10; i++) fx.update(DT, SPEED);
    expect(fx.particleCount).toBeLessThanOrEqual(n); // thrown once, not every frame
    const bike = fx.spawn('bike', 6, 120, LANE_CENTER_Y[0], -SPEED * 0.42, SPEED);
    fx.update(0.5, SPEED);
    expect(bike.ang).toBe(0);
    expect(Math.abs(bike.y - bike.toY)).toBeLessThan(2);
  });

  it('pools are fixed-size and reused (a busy boost allocates nothing)', () => {
    const fx = new KnockFx();
    const wrecks = fx.wrecks.slice();
    const parts = fx.parts.slice();
    for (let i = 0; i < 100; i++) {
      fx.spawn(i % 2 ? 'lorry' : 'suv', i, VIEW_W / 2, 60, -SPEED, SPEED, '', i % 5, 5);
      fx.update(DT * 20, SPEED);
    }
    expect(fx.wrecks).toHaveLength(MAX_WRECKS);
    expect(fx.parts).toHaveLength(MAX_PARTICLES);
    fx.wrecks.forEach((w, i) => expect(w).toBe(wrecks[i]));
    fx.parts.forEach((p, i) => expect(p).toBe(parts[i]));
  });

  it('screen shake is small and short', () => {
    const fx = new KnockFx();
    fx.shake(3);
    let max = 0;
    for (let i = 0; i < 200; i++) {
      const [x, y] = fx.shakeOffset(Math.random);
      max = Math.max(max, Math.abs(x), Math.abs(y));
    }
    expect(max).toBeLessThanOrEqual(3);
    fx.update(SHAKE_TIME + 0.01, SPEED);
    expect(fx.shakeOffset(Math.random)).toEqual([0, 0]);
  });

  it('spin frames wrap both ways', () => {
    expect(spinFrame(-1)).toBe(SPIN_FRAMES - 1);
    expect(spinFrame(SPIN_FRAMES + 2.5)).toBe(2);
  });
});
