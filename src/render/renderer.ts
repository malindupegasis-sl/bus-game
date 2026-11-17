import {
  BUS_X, GAME_TITLE, HUD_TOP, MUSIC_CREDIT, VEHICLE_BASELINE, KMH_PER_SPEED, LANE_CENTER_Y, LANE_HEIGHT, ROAD_BOTTOM, ROAD_TOP, VIEW_H, VIEW_W, laneY,
} from '../config';
import type { Game } from '../game/game';
import { formatScore } from '../game/score';
import { KINDS, isTelling, obstacleLane, obstacleX, type Obstacle } from '../game/obstacles';
import { UI_RECTS, type Rect } from '../ui-layout';
import { bubbleRect, bubbleWindow } from '../game/bubble';
import { BUS_W, busColumns, busExtent, busLimits, busPose, busWheels } from './busPose';
import {
  BUS_GLOW, BUS_SKINS, BUS_WHEELS, FONT_BIG, FONT_SMALL, PALETTE, PALM, PALM_PALETTE, SCENE, SPRITES, type Font, type SpriteName,
} from './sprites';

type Align = 'left' | 'center' | 'right';

/** Pseudo-random but stable speckles for the asphalt (x within a 256 tile, y within the road). */
const SPECKLES = Array.from({ length: 70 }, (_, i) => ({
  x: (i * 97 + ((i * i * 31) % 53)) % 256,
  y: ROAD_TOP + 2 + ((i * 53 + 7) % (ROAD_BOTTOM - ROAD_TOP - 4)),
}));

/** Route map polyline (HUD). */
const ROUTE = (
  [[89, 23], [93, 15], [99, 12], [104, 16], [110, 17], [114, 10], [119, 7], [125, 11], [130, 14], [135, 7]] as const
).map(([x, y]) => [x, HUD_TOP + 4 + y] as const);
const ROUTE_DISTANCE = 9000; // logical px of travel per lap of the mini map

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private cache = new Map<string, HTMLCanvasElement>();
  busSkin: keyof typeof BUS_SKINS = 'classic';

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
    ctx.imageSmoothingEnabled = false;
  }

  // ---------------------------------------------------------------- primitives

  private rect(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x), Math.round(y), w, h);
  }

  private pixelMap(rows: readonly string[], palette: Record<string, string | undefined>, key: string) {
    let c = this.cache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = Math.max(...rows.map((r) => r.length));
    c.height = rows.length;
    const g = c.getContext('2d')!;
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const col = palette[row[x]];
        if (row[x] === '.' || !col) continue;
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    });
    this.cache.set(key, c);
    return c;
  }

  sprite(name: SpriteName, skin: keyof typeof BUS_SKINS = 'classic'): HTMLCanvasElement {
    return this.pixelMap(SPRITES[name], { ...PALETTE, ...BUS_SKINS[skin] }, `${name}:${skin}`);
  }

  private glyph(font: Font, ch: string) {
    return font[ch] ?? font[ch.toUpperCase()] ?? font[' '];
  }

  textWidth(s: string, scale = 1, font: Font = FONT_SMALL): number {
    let w = 0;
    for (const ch of s) w += this.glyph(font, ch).w + 1;
    return Math.max(0, w - 1) * scale;
  }

  text(
    s: string, x: number, y: number, color = SCENE.text, scale = 1, align: Align = 'left', shadow = true,
    font: Font = FONT_SMALL,
  ): void {
    const str = s; // glyph() falls back to uppercase when a font has no lowercase
    const w = this.textWidth(str, scale, font);
    const cx = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
    if (shadow) this.glyphs(str, cx + scale, y + scale, SCENE.textShadow, scale, font);
    this.glyphs(str, cx, y, color, scale, font);
  }

  /** Title text in the 5×7 font. */
  title(s: string, y: number, scale: number, color = SCENE.title): void {
    this.text(s, VIEW_W / 2, y, color, scale, 'center', true, FONT_BIG);
  }

  private glyphs(s: string, x: number, y: number, color: string, scale: number, font: Font): void {
    this.ctx.fillStyle = color;
    for (const ch of s) {
      const g = this.glyph(font, ch);
      for (let i = 0; i < g.bits.length; i++) {
        if (g.bits[i]) this.ctx.fillRect(x + (i % g.w) * scale, y + Math.floor(i / g.w) * scale, scale, scale);
      }
      x += (g.w + 1) * scale;
    }
  }

  /** Seven-segment LCD digits, 8×14 each, unlit segments drawn faintly. */
  private lcd(value: string, x: number, y: number): void {
    const SEG: Record<string, [number, number, number, number]> = {
      a: [2, 0, 4, 2], b: [6, 2, 2, 4], c: [6, 8, 2, 4], d: [2, 12, 4, 2],
      e: [0, 8, 2, 4], f: [0, 2, 2, 4], g: [2, 6, 4, 2],
    };
    const DIGITS: Record<string, string> = {
      '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd',
      '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', ' ': '',
    };
    for (const ch of value) {
      const on = DIGITS[ch] ?? '';
      for (const [k, [sx, sy, w, h]] of Object.entries(SEG)) {
        this.rect(x + sx, y + sy, w, h, on.includes(k) ? SCENE.lcdOn : SCENE.lcdOff);
      }
      x += 10;
    }
  }

  // ---------------------------------------------------------------- frame

  draw(game: Game, now: number): void {
    const w = game.world;
    const ctx = this.ctx;
    ctx.save();
    // Screen shake right after a crash.
    if (game.phase === 'crashed' && game.phaseTime < 0.35) {
      const a = Math.round(3 * (1 - game.phaseTime / 0.35));
      ctx.translate(Math.round((Math.random() * 2 - 1) * a), Math.round((Math.random() * 2 - 1) * a));
    }
    this.scene(w.d);
    this.entities(game, now);
    ctx.restore();
    if (game.phase === 'crashed' && game.phaseTime < 0.06) this.rect(0, 0, VIEW_W, HUD_TOP, '#fcfcfc');
    this.hud(game, now);
    this.screens(game, now);
  }

  private scene(d: number): void {
    // Thin roadside strip above the road: sky, distant hills, grass, red-earth shoulder.
    const T = ROAD_TOP; // 9px
    this.rect(0, 0, VIEW_W, T, SCENE.sky);
    const hd = d * 0.08;
    for (let x = 0; x < VIEW_W; x++) {
      const h = Math.round(2 + 1.5 * Math.sin((x + hd) / 19) + Math.sin((x + hd) / 7.3));
      this.rect(x, T - 3 - h, 1, h, (Math.floor((x + hd) / 2) % 9 === 0) ? SCENE.hillDark : SCENE.hill);
    }
    this.rect(0, T - 4, VIEW_W, 2, SCENE.grass);
    this.rect(0, T - 2, VIEW_W, 2, SCENE.dirt);
    this.repeat(d * 1.0, 23, (x) => this.rect(x, T - 1, 2, 1, SCENE.dirtDark));
    // Palm tops peeking over the strip (parallax, behind the road)
    const palm = this.pixelMap(PALM, PALM_PALETTE, 'palm');
    this.repeat(d * 0.6, 61, (x, i) => this.ctx.drawImage(palm, Math.round(x), T - 11 + ((i * 7) % 2)));

    // Road
    this.rect(0, ROAD_TOP, VIEW_W, ROAD_BOTTOM - ROAD_TOP, SCENE.asphalt);
    const off = ((d % 256) + 256) % 256;
    for (const s of SPECKLES) {
      const x = (s.x - off + 256) % 256;
      this.rect(x, s.y, 2, 1, SCENE.asphaltDark);
    }
    this.rect(0, ROAD_TOP, VIEW_W, 1, SCENE.edge);
    this.rect(0, ROAD_BOTTOM - 1, VIEW_W, 1, SCENE.edge);
    // Lane dashes
    for (let l = 1; l < LANE_CENTER_Y.length; l++) {
      const y = ROAD_TOP + l * LANE_HEIGHT - 1;
      this.repeat(d, 24, (x) => this.rect(x, y, 12, 2, SCENE.line));
    }

    // Bottom verge: red-earth shoulder, grass and bushes
    const B = ROAD_BOTTOM;
    this.rect(0, B, VIEW_W, 3, SCENE.dirt);
    this.repeat(d, 19, (x) => this.rect(x, B + 1, 2, 1, SCENE.dirtDark));
    this.rect(0, B + 3, VIEW_W, HUD_TOP - B - 3, SCENE.grass);
    this.repeat(d * 1.15, 37, (x, i) => {
      const bx = Math.round(x);
      const w = 6 + (i % 3) * 2;
      this.rect(bx, HUD_TOP - 3, w, 3, SCENE.bushDark);
      this.rect(bx + 1, HUD_TOP - 5, w - 2, 3, SCENE.bush);
    });
  }

  /** Call fn for each repeat of a pattern with the given spacing, scrolled by `offset`. */
  private repeat(offset: number, spacing: number, fn: (x: number, index: number) => void): void {
    const first = Math.floor(offset / spacing);
    for (let i = first - 1; ; i++) {
      const x = i * spacing - offset;
      if (x > VIEW_W) break;
      fn(Math.round(x), i);
    }
  }

  private entities(game: Game, now: number): void {
    const w = game.world;
    type Drawable = { y: number; draw: () => void };
    const list: Drawable[] = [];

    this.drawSkids(w.d);
    for (const o of w.obstacles) {
      const lane = obstacleLane(o, w.d);
      list.push({ y: laneY(lane), draw: () => this.obstacle(o, w.d, lane, now) });
    }
    const busY = laneY(w.bus.pos);
    list.push({ y: busY, draw: () => this.bus(game, busY, now) });
    list.sort((a, b) => a.y - b.y);
    for (const e of list) e.draw();

    // Swearing bubbles go on top of everything on the road.
    for (const o of w.obstacles) if (o.kind === 'tuktuk') this.bubble(o, w.d);

    if (game.phase === 'crashed' || game.phase === 'over') {
      const blink = Math.floor(now * 12) % 2 === 0;
      const star = this.sprite('crash');
      const cx = BUS_X + BUS_W - 2 - Math.floor(star.width / 2);
      const cy = Math.round(busY - 4 - star.height / 2);
      if (game.phase === 'crashed' || blink) this.ctx.drawImage(star, cx, cy);
    }
  }

  // Cosmetic particles: exhaust puffs and lane-change dust (screen space), skid marks (on the road).
  private puffs: { x: number; y: number; age: number; dust?: boolean }[] = [];
  private skids: { x: number; y: number; d0: number; age: number }[] = [];
  private lastPuff = 0;
  private lastNow = 0;
  private lastTarget = -1;
  private lastWorld: unknown = null;
  /** The bus's on-screen box this frame (speech bubbles keep clear of it). */
  busRect = { x: 0, y: 0, w: 0, h: 0 };

  /** Skid marks are painted on the road, under every vehicle. */
  private drawSkids(d: number): void {
    for (const s of this.skids) {
      this.ctx.globalAlpha = Math.max(0, 0.85 - s.age * 1.1);
      const x = s.x - (d - s.d0);
      this.rect(x, s.y, 12, 1, '#2c2c2c');
      this.rect(x + 3, s.y - 1, 8, 1, '#383838');
    }
    this.ctx.globalAlpha = 1;
  }

  private bus(game: Game, busY: number, now: number): void {
    const w = game.world;
    const live = game.phase === 'playing' || game.phase === 'title';
    const dt = Math.min(0.1, Math.max(0, now - this.lastNow));
    this.lastNow = now;
    const frozen = game.phase === 'paused';
    const pose = busPose({
      laneY: busY, limits: busLimits(laneY, w.bus.pos, w.bus.target), d: w.d, moveDir: w.bus.moveDir, moveProgress: w.bus.moveProgress,
      sinceArrival: w.bus.sinceArrival, live, now,
    });
    const wheels = busWheels(pose, BUS_X);
    const ext = busExtent(pose, BUS_X);
    this.busRect = { x: ext.left, y: ext.top, w: ext.right - ext.left + 1, h: ext.bottom - ext.top + 1 };

    // A new lane change: skid marks under both wheels and a puff of dust at each.
    if (this.lastWorld !== w) {
      this.lastWorld = w;
      this.lastTarget = w.bus.target;
      this.skids = [];
    }
    if (w.bus.target !== this.lastTarget && game.phase === 'playing') {
      this.lastTarget = w.bus.target;
      for (const wh of wheels) {
        const ground = wh.y + BUS_WHEELS.r;
        this.skids.push({ x: wh.x - 6, y: ground, d0: w.d, age: 0 });
        for (let i = 0; i < 3; i++) this.puffs.push({ x: wh.x - 2 + i * 3, y: ground - 1, age: i * 0.04, dust: true });
      }
    }

    // Exhaust: a puff every ~0.12s from the tailpipe.
    if (live && now - this.lastPuff > 0.12) {
      this.lastPuff = now;
      this.puffs.push({ x: BUS_X + 1, y: pose.bodyBottom - 1, age: 0 });
    }
    const drift = 25 + (live ? w.speed * 0.5 : 0);
    if (!frozen) {
      for (const p of this.puffs) {
        p.age += dt;
        p.x -= (p.dust ? drift * 1.2 : drift) * dt;
        p.y -= (p.dust ? 8 : 6) * dt;
      }
      for (const s of this.skids) s.age += dt;
    }
    this.puffs = this.puffs.filter((p) => p.age < (p.dust ? 0.4 : 0.6) && p.x > -6);
    this.skids = this.skids.filter((s) => s.age < 0.8 && s.x - (w.d - s.d0) > -14);
    for (const p of this.puffs) {
      const size = 2 + Math.floor(p.age / (p.dust ? 0.1 : 0.15));
      this.ctx.globalAlpha = Math.max(0, 0.9 - p.age * (p.dust ? 2 : 1.3));
      const col = p.dust ? (p.age < 0.15 ? '#e0c090' : '#c8a070') : p.age < 0.15 ? PALETTE.g : PALETTE.G;
      this.rect(p.x - size / 2, p.y - size / 2, size, size, col);
    }
    this.ctx.globalAlpha = 1;

    // Body: each sprite column drawn into its tilted / squashed / stretched slot.
    const img = this.pixelMap(
      SPRITES.bus,
      { ...PALETTE, ...BUS_SKINS[this.busSkin], O: BUS_GLOW[pose.glow] },
      `bus:${this.busSkin}:${pose.glow}`,
    );
    for (const c of busColumns(pose, BUS_X)) this.ctx.drawImage(img, c.sx, 0, 1, img.height, c.dx, c.dy, c.dw, c.dh);

    // Spinning wheels.
    for (const wh of wheels) this.wheel(wh.x, wh.y, pose.wheelFrame);
  }

  private wheel(cx: number, cy: number, frame: number): void {
    const r = BUS_WHEELS.r;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const q = dx * dx + dy * dy;
        if (q > r * r + 1) continue;
        this.rect(cx + dx, cy + dy, 1, 1, q >= (r - 1) * (r - 1) + 1 ? PALETTE.K : PALETTE.D);
      }
    }
    // Spokes rotate through |, /, -, \ as the bus moves.
    const SPOKES = [[0, -1], [1, -1], [1, 0], [1, 1]];
    const [sx, sy] = SPOKES[frame];
    for (const k of [-3, -2, -1, 1, 2, 3]) this.rect(cx + sx * k, cy + sy * k, 1, 1, PALETTE.G);
    this.rect(cx, cy, 1, 1, PALETTE.L);
  }

  /** CSS px per logical px (set by the layout). The bubble text doubles when the game is small. */
  pixelScale = 2;

  private bubble(o: Obstacle, d: number): void {
    const scale = this.pixelScale < 2 ? 2 : 1;
    const b = bubbleRect(o, d, { textWidth: (t) => this.textWidth(t, 1, FONT_BIG), bus: this.busRect, scale });
    if (!b) return;
    const win = bubbleWindow(o)!;
    const age = (d - win[0]) / (win[1] - win[0]);
    // Pop: a small blob for the first moment, then the full bubble.
    if (age < 0.06) {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      this.rect(cx - 5, cy - 3, 10, 6, PALETTE.K);
      this.rect(cx - 4, cy - 2, 8, 4, PALETTE.L);
      return;
    }
    // White bubble, dark outline, tail pointing at the tuk-tuk.
    this.rect(b.x, b.y, b.w, b.h, PALETTE.K);
    this.rect(b.x + 1, b.y + 1, b.w - 2, b.h - 2, PALETTE.L);
    const t = b.tailAt;
    if (b.tail === 'left') {
      this.rect(b.x - 3, t - 1, 4, 3, PALETTE.K);
      this.rect(b.x - 2, t, 3, 1, PALETTE.L);
    } else if (b.tail === 'down') {
      this.rect(t - 1, b.y + b.h - 1, 3, 4, PALETTE.K);
      this.rect(t, b.y + b.h - 1, 1, 3, PALETTE.L);
    } else {
      this.rect(t - 1, b.y - 3, 3, 4, PALETTE.K);
      this.rect(t, b.y - 2, 1, 3, PALETTE.L);
    }
    this.text(b.text, b.x + 3, b.y + 3, '#101010', b.scale, 'left', false, FONT_BIG);
  }

  private obstacle(o: Obstacle, d: number, lane: number, now: number): void {
    const img = this.sprite(o.kind);
    const k = KINDS[o.kind];
    const x = Math.round(obstacleX(o, d));
    let y = Math.round(laneY(lane) + VEHICLE_BASELINE + 1 - img.height);
    const telling = isTelling(o, d);
    if (telling) {
      // Tell: hop (3px bounces, 4 per second) and lean 1px toward the lane it's about to take.
      y -= Math.round(3 * Math.abs(Math.sin(now * Math.PI * 4)));
      y += Math.sign(o.toLane - o.lane);
    }
    this.ctx.drawImage(img, x, y);
    if (telling && Math.floor(now * 6) % 2 === 0) {
      // Big amber blinkers front and back, plus an arrow showing which way it's going.
      this.rect(x - 2, y + 10, 4, 4, PALETTE.K);
      this.rect(x - 1, y + 11, 3, 3, PALETTE.y);
      this.rect(x + k.width - 2, y + 10, 4, 4, PALETTE.K);
      this.rect(x + k.width - 2, y + 11, 3, 3, PALETTE.y);
      const up = o.toLane < o.lane;
      const ax = x + Math.floor(k.width / 2);
      const ay = up ? y - 6 : y + img.height + 1;
      for (let i = 0; i < 3; i++) {
        const row = up ? ay + i : ay + 2 - i;
        this.rect(ax - i - 1, row, 2 * i + 3, 1, PALETTE.K);
        this.rect(ax - i, row, 2 * i + 1, 1, PALETTE.y);
      }
    }
  }

  // ---------------------------------------------------------------- HUD

  private hud(game: Game, now: number): void {
    const w = game.world;
    const top = HUD_TOP;
    this.rect(0, top, VIEW_W, VIEW_H - top, SCENE.hud);
    this.rect(0, top, VIEW_W, 1, PALETTE.K);
    this.rect(0, top + 1, VIEW_W, 1, SCENE.hudLight);
    this.rect(0, VIEW_H - 1, VIEW_W, 1, SCENE.hudDark);
    for (const bx of [2, VIEW_W - 4]) {
      this.rect(bx, top + 4, 2, 2, SCENE.hudDark);
      this.rect(bx, VIEW_H - 5, 2, 2, SCENE.hudDark);
    }
    const BH = 23; // box height inside the 28px HUD

    // LCD score
    this.box(6, top + 3, 68, BH, SCENE.lcdBg);
    this.text('SCORE', 9, top + 4, SCENE.lcdOn, 1, 'left', false);
    this.text(`HI ${game.highScore}`, 71, top + 4, SCENE.lcdOn, 1, 'right', false);
    const score = String(Math.min(999999, w.score)).padStart(6, ' ');
    this.lcd(score, 10, top + 10);

    // Route map
    this.box(84, top + 3, 56, BH, SCENE.mapBg);
    for (let i = 1; i < ROUTE.length; i++) this.line(ROUTE[i - 1], ROUTE[i], SCENE.mapRoad, 2);
    this.rect(ROUTE[0][0] - 1, ROUTE[0][1] - 1, 3, 3, PALETTE.L);
    const end = ROUTE[ROUTE.length - 1];
    this.rect(end[0], end[1] - 5, 1, 6, PALETTE.K);
    this.rect(end[0] + 1, end[1] - 5, 3, 2, PALETTE.y);
    const [px, py] = this.routePoint((w.d % ROUTE_DISTANCE) / ROUTE_DISTANCE);
    if (Math.floor(now * 4) % 2 === 0 || game.phase !== 'playing') {
      this.rect(px - 1, py - 1, 3, 3, SCENE.mapDot);
    }

    // Speedometer
    this.box(146, top + 3, 52, BH, SCENE.lcdBg);
    const kmh = Math.round(w.crashed || game.phase === 'title' ? 0 : w.speed * KMH_PER_SPEED);
    const cx = 171;
    const cy = top + 24;
    for (let a = 0; a <= 12; a++) {
      const ang = Math.PI + (a / 12) * Math.PI;
      const r = a % 3 === 0 ? 17 : 18;
      this.rect(Math.round(cx + Math.cos(ang) * 19), Math.round(cy + Math.sin(ang) * 19), 1, 1, SCENE.lcdOff);
      this.rect(Math.round(cx + Math.cos(ang) * r), Math.round(cy + Math.sin(ang) * r), 1, 1,
        a >= 10 ? PALETTE.R : SCENE.lcdOn);
    }
    const frac = Math.min(1, kmh / 120);
    const ang = Math.PI + frac * Math.PI;
    this.line([cx, cy], [cx + Math.cos(ang) * 14, cy + Math.sin(ang) * 14], PALETTE.y, 1);
    this.rect(cx - 1, cy - 1, 3, 3, PALETTE.L);

    this.box(202, top + 3, 48, BH, SCENE.lcdBg);
    this.lcd(String(kmh).padStart(3, ' '), 205, top + 5);
    this.text('KM/H', 247, top + 20, SCENE.lcdOn, 1, 'right', false);
  }

  private box(x: number, y: number, w: number, h: number, fill: string): void {
    this.rect(x - 1, y - 1, w + 2, h + 2, PALETTE.K);
    this.rect(x, y, w, h, fill);
    this.rect(x, y + h, w, 1, SCENE.hudDark);
  }

  private line(a: readonly number[], b: readonly number[], color: string, size: number): void {
    const steps = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), 1);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.rect(Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), size, size, color);
    }
  }

  private routePoint(p: number): [number, number] {
    const segs = ROUTE.length - 1;
    const f = p * segs;
    const i = Math.min(segs - 1, Math.floor(f));
    const t = f - i;
    return [
      Math.round(ROUTE[i][0] + (ROUTE[i + 1][0] - ROUTE[i][0]) * t),
      Math.round(ROUTE[i][1] + (ROUTE[i + 1][1] - ROUTE[i][1]) * t),
    ];
  }

  // ---------------------------------------------------------------- screens

  private dim(): void {
    this.ctx.fillStyle = SCENE.overlay;
    this.ctx.fillRect(0, 0, VIEW_W, HUD_TOP);
  }

  private button(r: Rect, label: string, fill: string, scale: number, enabled: boolean): void {
    this.rect(r.x - 1, r.y - 1, r.w + 2, r.h + 2, PALETTE.K);
    this.rect(r.x, r.y, r.w, r.h, enabled ? fill : PALETTE.g);
    this.rect(r.x, r.y, r.w, 1, 'rgba(255,255,255,0.45)');
    this.rect(r.x, r.y + r.h - 2, r.w, 2, 'rgba(0,0,0,0.35)');
    const th = 5 * scale;
    this.text(label, r.x + r.w / 2, r.y + Math.round((r.h - th) / 2) - 1, SCENE.text, scale, 'center');
  }

  private muteIcon(muted: boolean): void {
    const { x, y } = UI_RECTS.mute;
    this.rect(x - 1, y - 1, UI_RECTS.mute.w + 2, UI_RECTS.mute.h + 2, PALETTE.K);
    this.rect(x, y, UI_RECTS.mute.w, UI_RECTS.mute.h, SCENE.hud);
    // speaker
    this.rect(x + 3, y + 5, 2, 4, PALETTE.L);
    this.rect(x + 5, y + 4, 1, 6, PALETTE.L);
    this.rect(x + 6, y + 3, 1, 8, PALETTE.L);
    if (muted) {
      for (let i = 0; i < 5; i++) {
        this.rect(x + 9 + i, y + 4 + i, 1, 1, PALETTE.L);
        this.rect(x + 13 - i, y + 4 + i, 1, 1, PALETTE.L);
      }
    } else {
      this.rect(x + 9, y + 5, 1, 4, PALETTE.L);
      this.rect(x + 11, y + 4, 1, 6, PALETTE.L);
      this.rect(x + 13, y + 3, 1, 8, PALETTE.L);
    }
  }

  muted = false;
  touchHint = true;

  private screens(game: Game, now: number): void {
    const blink = Math.floor(now * 2.5) % 2 === 0;
    const mid = VIEW_W / 2;
    switch (game.phase) {
      case 'title': {
        this.dim();
        const [l1, l2] = splitTitle(GAME_TITLE);
        this.title(l1, 5, 3);
        this.title(l2, 29, 3);
        this.text(`HIGH SCORE ${formatScore(game.highScore)}`, mid, 55, SCENE.text, 1, 'center');
        if (blink) this.text('TAP TO START', mid, 65, SCENE.text, 2, 'center');
        this.text(
          this.touchHint ? 'SWIPE OR TAP THE ARROWS TO CHANGE LANE' : 'UP/DOWN ARROWS OR W/S TO CHANGE LANE',
          mid, 83, SCENE.skyLow, 1, 'center',
        );
        this.text(MUSIC_CREDIT, mid, 98, PALETTE.V, 1, 'center');
        break;
      }
      case 'paused':
        this.dim();
        this.title('PAUSED', 24, 3);
        if (blink) this.text('TAP TO RESUME', mid, 60, SCENE.text, 2, 'center');
        break;
      case 'over': {
        this.dim();
        this.title('GAME OVER', 7, 3);
        this.text(`SCORE ${formatScore(game.world.score)}`, mid, 34, SCENE.text, 2, 'center');
        this.text(`HIGH SCORE ${formatScore(game.highScore)}`, mid, 51, SCENE.text, 1, 'center');
        if (game.newBest && blink) this.text('NEW BEST!', mid, 62, PALETTE.y, 1, 'center');
        const ok = game.canRetry();
        this.button(UI_RECTS.retry, 'RETRY', '#e45c10', 2, ok);
        this.button(UI_RECTS.share, 'SHARE ON WHATSAPP', '#00a844', 1, ok);
        break;
      }
    }
    if (game.phase !== 'crashed') this.muteIcon(this.muted);
  }
}

/** Split a title into two lines at the space nearest the middle. */
export function splitTitle(t: string): [string, string] {
  const words = t.split(' ');
  let best: [string, string] = [t, ''];
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const diff = Math.abs(a.length - b.length);
    if (diff < bestDiff) [best, bestDiff] = [[a, b], diff];
  }
  return best;
}
