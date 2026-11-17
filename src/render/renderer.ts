import {
  BUS_X, GAME_TITLE, HUD_TOP, MUSIC_CREDIT, VEHICLE_BASELINE, KMH_PER_SPEED, LANE_CENTER_Y, LANE_HEIGHT, ROAD_BOTTOM,
  ROAD_TOP, VIEW_H, VIEW_W, laneY,
} from '../config';
import type { Game } from '../game/game';
import { formatScore } from '../game/score';
import { CONVOY_GAP, CONVOY_SUVS, CONVOY_SUV_W, KINDS, isTelling, obstacleLane, obstacleX, type Obstacle } from '../game/obstacles';
import { CAPTIONS, CAPTION_TIME, CONDUCTOR_SHOUTS, PROMISES, pick, type CaptionKey } from '../game/captions';
import { BOOST_TIME, TRANSITION_TIME } from '../game/charm';
import { PICKUP_W, pickupDrawBox, pickupX } from '../game/pickups';
import type { WorldEvent } from '../game/world';
import { UI_RECTS, type Rect } from '../ui-layout';
import { bubbleRect, bubbleSize, bubbleWindow, placeBubble, type BubbleRect, type Box } from '../game/bubble';
import { BUS_W, busExtent, busGroups, busLimits, busPose, busWheels, frontCharmAnchor } from './busPose';
import {
  BUS_GLOW, BUS_SKINS, BUS_WHEELS, FONT_BIG, FONT_SMALL, PALETTE, PALM, PALM_PALETTE, SCENE, SPRITES, type Font,
  type SpriteName,
} from './sprites';

type Align = 'left' | 'center' | 'right';

/** Colour-cycling LED strip colours for the Dham Rajina Xpress. */
const LED_COLORS = ['#ff2a6d', '#ffd400', '#28ff8c', '#2ad4ff', '#a64dff', '#ff7ae6'];
/** Collect feedback timings (s): body glint, sparkle burst, popups. All under a second. */
const GLINT_TIME = 0.4;
const BURST_TIME = 0.45;
const POPUP_TIME = 0.9;
/** How long the conductor hangs out shouting after the boost starts (s). */
const CONDUCTOR_TIME = 2;
/** Deterministic flicker noise in [0, 1) that changes 15 times a second. */
const flicker = (now: number) => ((Math.imul(Math.floor(now * 15), 2654435761) >>> 0) % 1000) / 1000;

/** Route map polyline (HUD). */
const ROUTE = (
  [[89, 23], [93, 15], [99, 12], [104, 16], [110, 17], [114, 10], [119, 7], [125, 11], [130, 14], [135, 7]] as const
).map(([x, y]) => [x, HUD_TOP + 4 + y] as const);
const ROUTE_DISTANCE = 9000; // logical px of travel per lap of the mini map

/** Max cosmetic particles alive at once (keeps the per-frame work bounded). */
const MAX_PUFFS = 24;
const MAX_SKIDS = 8;
/** Text images are cached; the cache is cleared if it grows past this (e.g. a long run's scores). */
const TEXT_CACHE_MAX = 300;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return [c, g];
}

/**
 * Draws the game at 256×144; CSS scales the canvas up once with nearest-neighbour.
 *
 * Performance: iOS Safari is slow with many tiny canvas calls, so everything that doesn't change
 * frame to frame (scenery strips, road texture, HUD panel, text, wheels, bubbles, LCD digits) is
 * rendered once into small offscreen canvases and blitted. A typical frame is ~60 draw calls.
 */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private cache = new Map<string, HTMLCanvasElement>();
  private textCache = new Map<string, HTMLCanvasElement>();
  busSkin: keyof typeof BUS_SKINS = 'classic';
  muted = false;
  touchHint = true;

  constructor(canvasEl: HTMLCanvasElement) {
    canvasEl.width = VIEW_W;
    canvasEl.height = VIEW_H;
    const ctx = canvasEl.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
    ctx.imageSmoothingEnabled = false;
  }

  // ---------------------------------------------------------------- primitives

  /** Last fill colour set on the main canvas (setting fillStyle is costly on iOS). */
  private lastFill = '';

  private rect(x: number, y: number, w: number, h: number, color: string, g = this.ctx): void {
    if (g !== this.ctx) g.fillStyle = color;
    else if (this.lastFill !== color) {
      g.fillStyle = color;
      this.lastFill = color;
    }
    g.fillRect(Math.round(x), Math.round(y), w, h);
  }

  /** A cached offscreen image, painted once by `paint`. */
  private layer(key: string, w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
    let c = this.cache.get(key);
    if (!c) {
      const [cv, g] = canvas(w, h);
      paint(g);
      c = cv;
      this.cache.set(key, c);
    }
    return c;
  }

  private pixelMap(rows: readonly string[], palette: Record<string, string | undefined>, key: string) {
    return this.layer(key, Math.max(...rows.map((r) => r.length)), rows.length, (g) => {
      rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          const col = palette[row[x]];
          if (row[x] === '.' || !col) continue;
          g.fillStyle = col;
          g.fillRect(x, y, 1, 1);
        }
      });
    });
  }

  private spritePalettes = new Map<string, Record<string, string | undefined>>();

  sprite(name: SpriteName, skin: keyof typeof BUS_SKINS = 'classic'): HTMLCanvasElement {
    const key = `${name}:${skin}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    return this.pixelMap(SPRITES[name], { ...PALETTE, ...BUS_SKINS[skin] }, key);
  }

  /** Route number shown on the sign board of your bus and of rival buses. */
  route = '138';

  private palette(skin: keyof typeof BUS_SKINS, glow: number): Record<string, string | undefined> {
    const key = `${skin}:${glow}`;
    let pal = this.spritePalettes.get(key);
    if (!pal) {
      pal = { ...PALETTE, ...BUS_SKINS[skin], O: BUS_GLOW[glow] };
      this.spritePalettes.set(key, pal);
    }
    return pal;
  }

  /**
   * Bus body for a skin and sign-board glow level, with the sign board redrawn: the route number
   * glowing for normal and rival buses; a blank board (for the scrolling name) for the Xpress.
   */
  private busImage(skin: keyof typeof BUS_SKINS, glow: number): HTMLCanvasElement {
    const key = `bus:${skin}:${glow}:${this.route}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const base = this.pixelMap(SPRITES.bus, this.palette(skin, glow), `busbase:${skin}:${glow}`);
    return this.layer(key, base.width, base.height, (g) => {
      g.drawImage(base, 0, 0);
      this.rect(55, 0, 19, 6, PALETTE.K, g);
      if (skin === 'xpress') {
        // Own livery: magenta band under the windows with the name in chrome-white lettering.
        this.rect(1, 15, 43, 5, '#b0108c', g);
        g.drawImage(this.textImage('DHAM RAJINA', '#ffffff', 1, false, FONT_SMALL), 1, 15);
        this.rect(1, 20, 43, 1, '#f4f4ff', g);
      } else {
        const t = this.textImage(this.route, BUS_GLOW[glow], 1, false, FONT_SMALL);
        g.drawImage(t, 55 + Math.floor((19 - t.width) / 2), 1);
      }
    });
  }

  private scratch: [HTMLCanvasElement, CanvasRenderingContext2D] | null = null;

  /** Dham Rajina Xpress frame: livery + colour-cycling LED strips + the name scrolling on the sign. */
  private xpressFrame(glow: number, now: number): HTMLCanvasElement {
    const base = this.busImage('xpress', glow);
    if (!this.scratch) this.scratch = canvas(base.width, base.height);
    const [c, g] = this.scratch;
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(base, 0, 0);
    const phase = Math.floor(now * 12) % LED_COLORS.length;
    const led = this.layer(`led:${phase}`, base.width, 1, (lg) => {
      for (let x = 0; x < base.width; x++) {
        this.rect(x, 0, 1, 1, x % 2 ? '#2a0838' : LED_COLORS[(Math.floor(x / 2) + phase) % LED_COLORS.length], lg);
      }
    });
    g.drawImage(led, 0, 3);
    g.drawImage(led, 0, 22);
    // Scrolling LED marquee on the 17px sign board window.
    const text = this.textImage('DHAM RAJINA XPRESS * ', '#ff7af0', 1, false, FONT_SMALL);
    const off = Math.floor(now * 20) % text.width;
    const first = Math.min(17, text.width - off);
    g.drawImage(text, off, 0, first, 5, 56, 1, first, 5);
    if (first < 17) g.drawImage(text, 0, 0, 17 - first, 5, 56 + first, 1, 17 - first, 5);
    return c;
  }

  private glyph(font: Font, ch: string) {
    return font[ch] ?? font[ch.toUpperCase()] ?? font[' '];
  }

  textWidth(s: string, scale = 1, font: Font = FONT_SMALL): number {
    let w = 0;
    for (const ch of s) w += this.glyph(font, ch).w + 1;
    return Math.max(0, w - 1) * scale;
  }

  /** Text rendered once into a cached image (with optional 1-scale drop shadow). */
  private textImage(s: string, color: string, scale: number, shadow: boolean, font: Font): HTMLCanvasElement {
    const key = `${font === FONT_BIG ? 'B' : 'S'}|${scale}|${color}|${shadow ? 1 : 0}|${s}`;
    let c = this.textCache.get(key);
    if (c) return c;
    if (this.textCache.size > TEXT_CACHE_MAX) this.textCache.clear();
    const h = (font === FONT_BIG ? 7 : 5) * scale;
    const w = this.textWidth(s, scale, font);
    const [cv, g] = canvas(w + (shadow ? scale : 0), h + (shadow ? scale : 0));
    const paint = (ox: number, oy: number, col: string) => {
      g.fillStyle = col;
      let x = ox;
      for (const ch of s) {
        const gl = this.glyph(font, ch);
        for (let i = 0; i < gl.bits.length; i++) {
          if (gl.bits[i]) g.fillRect(x + (i % gl.w) * scale, oy + Math.floor(i / gl.w) * scale, scale, scale);
        }
        x += (gl.w + 1) * scale;
      }
    };
    if (shadow) paint(scale, scale, SCENE.textShadow);
    paint(0, 0, color);
    c = cv;
    this.textCache.set(key, c);
    return c;
  }

  text(
    s: string, x: number, y: number, color = SCENE.text, scale = 1, align: Align = 'left', shadow = true,
    font: Font = FONT_SMALL,
  ): void {
    const w = this.textWidth(s, scale, font);
    const cx = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
    this.ctx.drawImage(this.textImage(s, color, scale, shadow, font), cx, Math.round(y));
  }

  /** Title text in the 5×7 font. */
  title(s: string, y: number, scale: number, color = SCENE.title): void {
    this.text(s, VIEW_W / 2, y, color, scale, 'center', true, FONT_BIG);
  }

  /** Seven-segment LCD digit images (unlit segments drawn faintly), 8×14 each. */
  private lcdDigit(ch: string): HTMLCanvasElement {
    return this.layer(`lcd:${ch}`, 8, 14, (g) => {
      const SEG: Record<string, [number, number, number, number]> = {
        a: [2, 0, 4, 2], b: [6, 2, 2, 4], c: [6, 8, 2, 4], d: [2, 12, 4, 2],
        e: [0, 8, 2, 4], f: [0, 2, 2, 4], g: [2, 6, 4, 2],
      };
      const DIGITS: Record<string, string> = {
        '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd',
        '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', ' ': '',
      };
      const on = DIGITS[ch] ?? '';
      for (const [k, [sx, sy, w, h]] of Object.entries(SEG)) this.rect(sx, sy, w, h, on.includes(k) ? SCENE.lcdOn : SCENE.lcdOff, g);
    });
  }

  private lcd(value: string, x: number, y: number): void {
    for (const ch of value) {
      this.ctx.drawImage(this.lcdDigit(ch), x, y);
      x += 10;
    }
  }

  // ---------------------------------------------------------------- frame

  /**
   * Draw one frame. `alpha` (0–1) is how far we are between the last two fixed 60 Hz updates;
   * positions are interpolated so motion is smooth on 90/120 Hz screens.
   */
  draw(game: Game, now: number, alpha = 1): void {
    const w = game.world;
    const d = w.prevD + (w.d - w.prevD) * alpha;
    const busPos = w.bus.prevPos + (w.bus.pos - w.bus.prevPos) * alpha;
    const ctx = this.ctx;
    this.lastFill = '';
    ctx.save();
    // Screen shake right after a crash.
    if (game.phase === 'crashed' && game.phaseTime < 0.35) {
      const a = Math.round(3 * (1 - game.phaseTime / 0.35));
      ctx.translate(Math.round((Math.random() * 2 - 1) * a), Math.round((Math.random() * 2 - 1) * a));
    }
    this.scene(d);
    this.entities(game, now, d, busPos);
    ctx.restore();
    this.lastFill = ''; // restore() reset fillStyle
    if (game.phase === 'crashed' && game.phaseTime < 0.06) this.rect(0, 0, VIEW_W, HUD_TOP, '#fcfcfc');
    this.hud(game, now, d);
    this.screens(game, now);
  }

  /** Blit a pre-rendered horizontally repeating strip, scrolled by `offset`. */
  private strip(img: HTMLCanvasElement, period: number, offset: number, y: number): void {
    const x = -(((offset % period) + period) % period);
    this.ctx.drawImage(img, Math.round(x), y);
    if (x + img.width < VIEW_W) this.ctx.drawImage(img, Math.round(x + img.width), y);
  }

  private scene(d: number): void {
    const T = ROAD_TOP; // 9px strip above the road
    // Sky and distant hills (periodic in 512px so it can be pre-rendered and tiled)
    const hills = this.layer('hills', 512, T, (g) => {
      this.rect(0, 0, 512, T, SCENE.sky, g);
      for (let x = 0; x < 512; x++) {
        const h = Math.round(2 + 1.5 * Math.sin((2 * Math.PI * 4 * x) / 512) + Math.sin((2 * Math.PI * 11 * x) / 512));
        this.rect(x, T - 3 - h, 1, h, Math.floor(x / 2) % 9 === 0 ? SCENE.hillDark : SCENE.hill, g);
      }
    });
    this.strip(hills, 512, d * 0.08, 0);
    // Palm tops peeking over the strip (parallax, behind the road)
    const palm = this.pixelMap(PALM, PALM_PALETTE, 'palm');
    this.repeat(d * 0.6, 61, (x, i) => this.ctx.drawImage(palm, x, T - 11 + ((i * 7) % 2)));
    // Grass + red-earth shoulder
    const verge = this.layer('vergeTop', 256 + 23, 4, (g) => {
      this.rect(0, 0, 256 + 23, 2, SCENE.grass, g);
      this.rect(0, 2, 256 + 23, 2, SCENE.dirt, g);
      for (let x = 0; x < 256 + 23; x += 23) this.rect(x, 3, 2, 1, SCENE.dirtDark, g);
    });
    this.strip(verge, 23, d, T - 4);

    // Road: asphalt with speckles and yellow edge lines (one 256px tile), then lane dashes.
    const road = this.layer('road', 256, ROAD_BOTTOM - ROAD_TOP, (g) => {
      const H = ROAD_BOTTOM - ROAD_TOP;
      this.rect(0, 0, 256, H, SCENE.asphalt, g);
      for (let i = 0; i < 70; i++) {
        const x = (i * 97 + ((i * i * 31) % 53)) % 256;
        const y = 2 + ((i * 53 + 7) % (H - 4));
        this.rect(x, y, 2, 1, SCENE.asphaltDark, g);
      }
      this.rect(0, 0, 256, 1, SCENE.edge, g);
      this.rect(0, H - 1, 256, 1, SCENE.edge, g);
    });
    this.strip(road, 256, d, ROAD_TOP);
    const dashes = this.layer('dashes', 256 + 24, ROAD_BOTTOM - ROAD_TOP, (g) => {
      for (let l = 1; l < LANE_CENTER_Y.length; l++) {
        for (let x = 0; x < 256 + 24; x += 24) this.rect(x, l * LANE_HEIGHT - 1, 12, 2, SCENE.line, g);
      }
    });
    this.strip(dashes, 24, d, ROAD_TOP);

    // Bottom verge: red-earth shoulder (moves with the road), grass and bushes (slight parallax).
    const B = ROAD_BOTTOM;
    const shoulder = this.layer('vergeBottom', 256 + 19, 3, (g) => {
      this.rect(0, 0, 256 + 19, 3, SCENE.dirt, g);
      for (let x = 0; x < 256 + 19; x += 19) this.rect(x, 1, 2, 1, SCENE.dirtDark, g);
    });
    this.strip(shoulder, 19, d, B);
    const grassH = HUD_TOP - B - 3;
    const bushes = this.layer('bushes', 256 + 111, grassH, (g) => {
      this.rect(0, 0, 256 + 111, grassH, SCENE.grass, g);
      for (let i = 0; i * 37 < 256 + 111; i++) {
        const bx = i * 37;
        const w = 6 + (i % 3) * 2;
        this.rect(bx, grassH - 3, w, 3, SCENE.bushDark, g);
        this.rect(bx + 1, grassH - 5, w - 2, 3, SCENE.bush, g);
      }
    });
    this.strip(bushes, 111, d * 1.15, B + 3);
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

  private drawList: { y: number; o: Obstacle | null; lane: number }[] = [];
  private lastOverlay = 0;

  private entities(game: Game, now: number, d: number, busPos: number): void {
    const w = game.world;
    this.drawSkids(d);
    this.drawPickups(game, d, now);
    // Painter's order by lane (no closures or new arrays per frame).
    const list = this.drawList;
    list.length = 0;
    for (const o of w.obstacles) {
      const lane = obstacleLane(o, d);
      list.push({ y: laneY(lane), o, lane });
    }
    const busY = laneY(busPos);
    list.push({ y: busY, o: null, lane: busPos });
    list.sort((a, b) => a.y - b.y);
    for (const e of list) {
      if (e.o) this.obstacle(e.o, d, e.lane, now);
      else this.bus(game, busY, busPos, now, d);
    }

    // Swearing bubbles go on top of everything on the road.
    for (const o of w.obstacles) if (o.kind === 'tuktuk') this.bubble(o, d);
    const dt = Math.min(0.1, Math.max(0, now - this.lastOverlay));
    this.lastOverlay = now;
    this.overlays(game, d, game.phase === 'paused' ? 0 : dt);

    if (game.phase === 'crashed' || game.phase === 'over') {
      const blink = Math.floor(now * 12) % 2 === 0;
      const star = this.sprite('crash');
      const cx = BUS_X + BUS_W - 2 - Math.floor(star.width / 2);
      const cy = Math.round(busY - 4 - star.height / 2);
      if (game.phase === 'crashed' || blink) this.ctx.drawImage(star, cx, cy);
    }
  }

  // Cosmetic particles: exhaust puffs and lane-change dust (screen space), skid marks (on the road).
  private puffs: { x: number; y: number; age: number; dust: boolean }[] = [];
  private skids: { x: number; y: number; d0: number; age: number }[] = [];
  private lastPuff = 0;
  private lastNow = 0;
  private lastTarget = -1;
  private lastWorld: unknown = null;
  /** The bus's on-screen box this frame (speech bubbles keep clear of it). */
  busRect = { x: 0, y: 0, w: 0, h: 0 };

  /** For the debug overlay. */
  get particleCount(): number {
    return this.puffs.length + this.skids.length;
  }

  /** Skid marks are painted on the road, under every vehicle. */
  private drawSkids(d: number): void {
    if (!this.skids.length) return;
    for (const s of this.skids) {
      this.ctx.globalAlpha = Math.max(0, 0.85 - s.age * 1.1);
      const x = s.x - (d - s.d0);
      this.rect(x, s.y, 12, 1, '#2c2c2c');
      this.rect(x + 3, s.y - 1, 8, 1, '#383838');
    }
    this.ctx.globalAlpha = 1;
  }

  private bus(game: Game, busY: number, busPos: number, now: number, d: number): void {
    const w = game.world;
    const live = game.phase === 'playing' || game.phase === 'title';
    const dt = Math.min(0.1, Math.max(0, now - this.lastNow));
    this.lastNow = now;
    const frozen = game.phase === 'paused';
    const pose = busPose({
      laneY: busY, limits: busLimits(laneY, busPos, w.bus.target), d, moveDir: w.bus.moveDir,
      moveProgress: w.bus.moveProgress, sinceArrival: w.bus.sinceArrival, live, now,
    });
    const wheels = busWheels(pose, BUS_X);
    const ext = busExtent(pose, BUS_X);
    const r = this.busRect;
    r.x = ext.left;
    r.y = ext.top;
    r.w = ext.right - ext.left + 1;
    r.h = ext.bottom - ext.top + 1;

    // A new lane change: skid marks under both wheels and a puff of dust at each.
    if (this.lastWorld !== w) {
      this.lastWorld = w;
      this.lastTarget = w.bus.target;
      this.skids.length = 0;
      this.puffs.length = 0;
    }
    if (w.bus.target !== this.lastTarget && game.phase === 'playing') {
      this.lastTarget = w.bus.target;
      for (const wh of wheels) {
        const ground = wh.y + BUS_WHEELS.r;
        this.skids.push({ x: wh.x - 6, y: ground, d0: d, age: 0 });
        for (let i = 0; i < 3; i++) this.puffs.push({ x: wh.x - 2 + i * 3, y: ground - 1, age: i * 0.04, dust: true });
      }
    }

    // Exhaust: a puff every ~0.12s from the tailpipe.
    if (live && now - this.lastPuff > 0.12) {
      this.lastPuff = now;
      this.puffs.push({ x: BUS_X + 1, y: pose.bodyBottom - 1, age: 0, dust: false });
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
    // Drop particles that have faded or left the screen (in place, oldest first if over the cap).
    let n = 0;
    for (const p of this.puffs) if (p.age < (p.dust ? 0.4 : 0.6) && p.x > -6) this.puffs[n++] = p;
    this.puffs.length = n;
    if (this.puffs.length > MAX_PUFFS) this.puffs.splice(0, this.puffs.length - MAX_PUFFS);
    n = 0;
    for (const s of this.skids) if (s.age < 0.8 && s.x - (d - s.d0) > -14) this.skids[n++] = s;
    this.skids.length = n;
    if (this.skids.length > MAX_SKIDS) this.skids.splice(0, this.skids.length - MAX_SKIDS);

    for (const p of this.puffs) {
      const size = 2 + Math.floor(p.age / (p.dust ? 0.1 : 0.15));
      this.ctx.globalAlpha = Math.max(0, 0.9 - p.age * (p.dust ? 2 : 1.3));
      const col = p.dust ? (p.age < 0.15 ? '#e0c090' : '#c8a070') : p.age < 0.15 ? PALETTE.g : PALETTE.G;
      this.rect(p.x - size / 2, p.y - size / 2, size, size, col);
    }
    this.ctx.globalAlpha = 1;

    // Which look: the Dham Rajina Xpress while boosted, flickering back during the transition.
    const c = w.charm;
    const xpress = c.boostT > 0 || (c.transitionT > 0 && flicker(now) < c.transitionT / TRANSITION_TIME);
    const img = xpress ? this.xpressFrame(pose.glow, now) : this.busImage(this.busSkin, pose.glow);
    // Lucky-charm save: blink while invincible.
    const blink = c.invincibleT > 0 && c.boostT === 0 && c.transitionT === 0 && Math.floor(now * 10) % 2 === 0;
    if (blink) this.ctx.globalAlpha = 0.3;

    // Body: one blit when level; a handful of column groups while tilted / squashed / stretched.
    for (const gr of busGroups(pose, BUS_X)) {
      this.ctx.drawImage(img, gr.sx, 0, gr.sw, img.height, gr.dx, gr.dy, gr.dw, gr.dh);
    }

    // Spinning wheels (4 cached frames).
    for (const wh of wheels) {
      this.ctx.drawImage(this.wheelImage(pose.wheelFrame), wh.x - BUS_WHEELS.r, wh.y - BUS_WHEELS.r);
    }

    // The lime-and-chilli charm hangs under the front bumper and grows as you collect:
    // 1 chilli, 2 chillies, then the full charm with the lime during the boost. The string stays
    // tied to the bumper; the charm sways (more while changing lanes). Cosmetic: not in the hitbox.
    if (c.chillies > 0) {
      const name = c.boostT > 0 ? 'frontCharmFull' : c.chillies === 2 ? 'frontCharm2' : 'frontCharm1';
      const img = this.sprite(name);
      const a = frontCharmAnchor(pose, BUS_X);
      const moving = w.bus.moving;
      const sway = Math.round(Math.sin(now * (moving ? 14 : 5)) * (moving ? 1.6 : 0.8));
      const x0 = a.x - Math.floor(img.width / 2);
      this.ctx.drawImage(img, 0, 0, img.width, 2, x0, a.y, img.width, 2);
      this.ctx.drawImage(img, 0, 2, img.width, img.height - 2, x0 + sway, a.y + 2, img.width, img.height - 2);
      this.charmAt = { x: a.x, y: a.y };
    }
    this.ctx.globalAlpha = 1;

    // Collect feedback: a quick white flash, then a gold glint sweeping across the body.
    const gt = now - this.glintAt;
    if (gt >= 0 && gt < GLINT_TIME) {
      const groups = busGroups(pose, BUS_X);
      if (gt < 0.12) {
        this.ctx.globalAlpha = 0.6 * (1 - gt / 0.12);
        const white = this.busSilhouette('#ffffff');
        for (const gr of groups) this.ctx.drawImage(white, gr.sx, 0, gr.sw, white.height, gr.dx, gr.dy, gr.dw, gr.dh);
      }
      const gold = this.busSilhouette('#ffe060');
      const s0 = -10 + (gt / GLINT_TIME) * (BUS_W + 20);
      this.ctx.globalAlpha = 0.8;
      for (const gr of groups) {
        const a = Math.max(gr.sx, Math.floor(s0));
        const b = Math.min(gr.sx + gr.sw, Math.floor(s0) + 8);
        if (b <= a) continue;
        const k = gr.dw / gr.sw;
        this.ctx.drawImage(gold, a, 0, b - a, gold.height, Math.round(gr.dx + (a - gr.sx) * k), gr.dy, Math.max(1, Math.round((b - a) * k)), gr.dh);
      }
      this.ctx.globalAlpha = 1;
    }

    // Conductor hangs out of the door and shouts when the boost starts.
    this.conductorBubble = null;
    if (c.boostT > BOOST_TIME - CONDUCTOR_TIME) {
      const k = this.sprite('conductor');
      const kx = BUS_X + 43;
      this.ctx.drawImage(k, kx + Math.round(Math.sin(now * 14)), ext.top + 3);
      this.conductorBubble = { x: kx, y: ext.top, w: k.width, h: ext.bottom - ext.top + 1 };
    }

    // Sparkles while boosted (and fading out through the transition).
    if ((c.boostT > 0 || c.transitionT > 0) && !frozen) {
      const n = c.boostT > 0 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        this.sparkles.push({
          x: r.x - 4 + Math.random() * (r.w + 8), y: r.y - 2 + Math.random() * (r.h + 2), age: 0,
          col: LED_COLORS[Math.floor(Math.random() * LED_COLORS.length)],
        });
      }
    }
    if (!frozen) for (const sp of this.sparkles) { sp.age += dt; sp.x -= drift * 0.6 * dt; }
    let m = 0;
    for (const sp of this.sparkles) if (sp.age < 0.35) this.sparkles[m++] = sp;
    this.sparkles.length = Math.min(m, 40);
    for (const sp of this.sparkles) {
      const big = sp.age < 0.15;
      this.rect(sp.x, sp.y, 1, 1, '#ffffff');
      if (big) {
        this.rect(sp.x - 1, sp.y, 1, 1, sp.col);
        this.rect(sp.x + 1, sp.y, 1, 1, sp.col);
        this.rect(sp.x, sp.y - 1, 1, 1, sp.col);
        this.rect(sp.x, sp.y + 1, 1, 1, sp.col);
      }
    }
  }

  private sparkles: { x: number; y: number; age: number; col: string }[] = [];
  /** Time of the last pickup (for the body glint), and where the front charm hangs. */
  private glintAt = -9;
  private charmAt = { x: BUS_X + 68, y: 0 };
  private bursts: { x: number; y: number; vx: number; vy: number; age: number; col: string }[] = [];

  /** The bus body as a single-colour silhouette (for the collect flash and glint). */
  private busSilhouette(color: string): HTMLCanvasElement {
    return this.layer(`busSil:${color}`, SPRITES.bus[0].length, SPRITES.bus.length, (g) => {
      g.drawImage(this.busImage('classic', 1), 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = color;
      g.fillRect(0, 0, SPRITES.bus[0].length, SPRITES.bus.length);
      g.globalCompositeOperation = 'source-over';
    });
  }
  private conductorBubble: Box | null = null;

  private wheelImage(frame: number): HTMLCanvasElement {
    const r = BUS_WHEELS.r;
    return this.layer(`wheel:${frame}`, 2 * r + 1, 2 * r + 1, (g) => {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const q = dx * dx + dy * dy;
          if (q > r * r + 1) continue;
          this.rect(r + dx, r + dy, 1, 1, q >= (r - 1) * (r - 1) + 1 ? PALETTE.K : PALETTE.D, g);
        }
      }
      // Spokes rotate through |, /, -, \ as the bus moves.
      const SPOKES = [[0, -1], [1, -1], [1, 0], [1, 1]];
      const [sx, sy] = SPOKES[frame];
      for (const k of [-3, -2, -1, 1, 2, 3]) this.rect(r + sx * k, r + sy * k, 1, 1, PALETTE.G, g);
      this.rect(r, r, 1, 1, PALETTE.L, g);
    });
  }

  /** A whole speech bubble (box + text) rendered once per phrase. */
  private bubbleImage(b: BubbleRect): HTMLCanvasElement {
    return this.layer(`bubble:${b.text}:${b.scale}`, b.w, b.h, (g) => {
      this.rect(0, 0, b.w, b.h, PALETTE.K, g);
      this.rect(1, 1, b.w - 2, b.h - 2, PALETTE.L, g);
      g.drawImage(this.textImage(b.text, '#101010', b.scale, false, FONT_BIG), 3, 3);
    });
  }

  private bubbleMeasure = (t: string) => this.textWidth(t, 1, FONT_BIG);

  private bubble(o: Obstacle, d: number): void {
    // Normal 5×7 size (v1.3 doubled it in portrait; that was too big on phones).
    const b = bubbleRect(o, d, { textWidth: this.bubbleMeasure, bus: this.busRect, scale: 1 });
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
    this.drawBubble(b);
  }

  /** White bubble with a dark outline (cached per phrase) and a tail pointing at the speaker. */
  private drawBubble(b: BubbleRect): void {
    this.ctx.drawImage(this.bubbleImage(b), b.x, b.y);
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
  }

  private obstacle(o: Obstacle, d: number, lane: number, now: number): void {
    if (o.kind === 'convoy') return this.convoy(o, d, lane, now);
    if (o.kind === 'rival') return this.rival(o, d, lane);
    const img = this.sprite(o.kind);
    const k = KINDS[o.kind];
    const x = Math.round(obstacleX(o, d));
    if (x > VIEW_W || x + img.width < 0) return;
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
      const up = o.toLane < o.lane;
      const tell = this.layer(`tell:${o.kind}:${up}`, k.width + 4, img.height + 14, (g) => {
        const oy = 7;
        this.rect(0, oy + 10, 4, 4, PALETTE.K, g);
        this.rect(1, oy + 11, 3, 3, PALETTE.y, g);
        this.rect(k.width, oy + 10, 4, 4, PALETTE.K, g);
        this.rect(k.width, oy + 11, 3, 3, PALETTE.y, g);
        const ax = 2 + Math.floor(k.width / 2);
        const ay = up ? oy - 6 : oy + img.height + 1;
        for (let i = 0; i < 3; i++) {
          const row = up ? ay + i : ay + 2 - i;
          this.rect(ax - i - 1, row, 2 * i + 3, 1, PALETTE.K, g);
          this.rect(ax - i, row, 2 * i + 1, 1, PALETTE.y, g);
        }
      });
      this.ctx.drawImage(tell, x - 2, y - 7);
    }
  }

  /** Five black SUVs with flashing red/blue roof lights; the politician leans out of the middle one. */
  private convoy(o: Obstacle, d: number, lane: number, now: number): void {
    const x = Math.round(obstacleX(o, d));
    if (x > VIEW_W || x + KINDS.convoy.width < 0) return;
    const suv = this.sprite('suv');
    const y = Math.round(laneY(lane) + VEHICLE_BASELINE + 1 - suv.height);
    const step = CONVOY_SUV_W + CONVOY_GAP;
    for (let i = 0; i < CONVOY_SUVS; i++) this.ctx.drawImage(suv, x + i * step, y);
    const phase = Math.floor(now * 8) % 2;
    const lights = this.layer(`convoyLights:${phase}`, KINDS.convoy.width, 3, (g) => {
      for (let i = 0; i < CONVOY_SUVS; i++) {
        const sx = i * step;
        const redOn = (i + phase) % 2 === 0;
        this.rect(sx + 9, 0, 4, 2, redOn ? '#ff2020' : '#601010', g);
        this.rect(sx + 14, 0, 4, 2, redOn ? '#102060' : '#2060ff', g);
        this.rect(sx + 8, 2, 11, 1, PALETTE.K, g);
        if (redOn) this.rect(sx + 10, 0, 1, 1, '#ffc0c0', g);
        else this.rect(sx + 16, 0, 1, 1, '#c0d0ff', g);
      }
    });
    this.ctx.drawImage(lights, x, y - 1);
    // Fictional politician leaning out of the middle SUV, waving, shouting a campaign promise.
    const pol = this.sprite('politician');
    const px = x + 2 * step + 9;
    const py = y - 8 + (Math.floor(now * 4) % 2);
    this.ctx.drawImage(pol, px, py);
    if (px > 96 && px < VIEW_W - 8) this.politicianBubbles.push({ text: pick(PROMISES, o.id), anchor: { x: px, y: py, w: pol.width, h: pol.height } });
  }

  private politicianBubbles: { text: string; anchor: Box }[] = [];

  /** A same-route rival bus (blue and yellow livery, same route number on its sign). */
  private rival(o: Obstacle, d: number, lane: number): void {
    const x = Math.round(obstacleX(o, d));
    if (x > VIEW_W || x + KINDS.rival.width < 0) return;
    const wheelY = Math.round(laneY(lane)) + VEHICLE_BASELINE - BUS_WHEELS.r;
    const img = this.busImage('rival', 1);
    this.ctx.drawImage(img, x, wheelY - BUS_WHEELS.y);
    const frame = Math.floor(d / 5) % 4;
    for (const wx of BUS_WHEELS.xs) this.ctx.drawImage(this.wheelImage(frame), x + wx - BUS_WHEELS.r, wheelY - BUS_WHEELS.r);
  }

  /** Chillies and limes on the road, bobbing and glinting. */
  private drawPickups(game: Game, d: number, now: number): void {
    for (const p of game.world.pickups) {
      if (p.collected) continue;
      const x = Math.round(pickupX(p, d));
      if (x > VIEW_W || x + PICKUP_W < 0) continue;
      const img = this.sprite(p.kind);
      const bob = (Math.sin(now * 6 + p.id) > 0 ? 1 : 0) as 0 | 1;
      const box = pickupDrawBox(p.kind, laneY(p.lane), bob);
      this.rect(x + 3, box.shadowY, PICKUP_W - 6, 1, 'rgba(0,0,0,0.35)');
      this.ctx.drawImage(img, x, box.y);
      if (Math.floor(now * 3 + p.id) % 3 === 0) this.rect(x + 8, box.y + 6, 2, 2, '#ffffff');
    }
  }

  /** Speech bubbles for the politician and the conductor (they never cover the bus). */
  private speech(text: string, anchor: Box, order: readonly ('right' | 'above' | 'below')[]): void {
    const { w, h } = bubbleSize(text, 1, this.bubbleMeasure);
    const at = placeBubble(anchor, w, h, this.busRect, order);
    if (!at) return;
    this.drawBubble({ ...at, w, h, text, scale: 1 });
  }

  // ---------------------------------------------------------------- events, popups, captions

  private popups: { text: string; color: string; age: number }[] = [];
  private captionQueue: CaptionKey[] = [];
  private caption: { key: CaptionKey; age: number } | null = null;
  private fallingCharm: { x: number; y: number; vy: number; age: number } | null = null;
  private shoutN = 0;
  private conductorText = CONDUCTOR_SHOUTS[0] as string;

  /** World events that need a visual: captions, popups, the falling charm, the conductor's shout. */
  onEvent(e: WorldEvent): void {
    if (e.type === 'seen') this.captionQueue.push(e.what);
    else if (e.type === 'pickup') {
      this.glintAt = this.lastNow;
      this.popups.push({ text: e.kind === 'chilli' ? '+CHILLI!' : '+LIME!', color: e.kind === 'chilli' ? '#7cfc7c' : '#e0f870', age: 0 });
      // Sparkle burst off the pickup.
      const cx = e.x + PICKUP_W / 2;
      const cy = laneY(e.lane) - 2;
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
        const sp = 45 + Math.random() * 35;
        const col = ['#ffe060', '#ffffff', e.kind === 'chilli' ? '#58e858' : '#e0f870'][i % 3];
        this.bursts.push({ x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, age: 0, col });
      }
    }
    else if (e.type === 'overtake') this.popups.push({ text: `+${e.bonus} OVERTAKE!`, color: PALETTE.y, age: 0 });
    else if (e.type === 'charm' && e.what === 'saved') {
      this.popups.push({ text: 'LUCKY CHARM!', color: '#7cfc7c', age: 0 });
      this.fallingCharm = { x: this.charmAt.x - 3, y: this.charmAt.y, vy: -40, age: 0 };
    } else if (e.type === 'charm' && e.what === 'boostStart') {
      this.conductorText = pick(CONDUCTOR_SHOUTS, this.shoutN++);
      this.popups.push({ text: 'DHAM RAJINA XPRESS!', color: '#ff7af0', age: 0 });
    } else if (e.type === 'charm' && e.what === 'charmHung') {
      this.popups.push({ text: 'LUCKY CHARM ON!', color: '#7cfc7c', age: 0 });
    }
  }

  private overlays(game: Game, d: number, dt: number): void {
    // Politician and conductor speech bubbles.
    for (const pb of this.politicianBubbles) this.speech(pb.text, pb.anchor, ['above', 'below', 'right']);
    this.politicianBubbles.length = 0;
    if (this.conductorBubble) this.speech(this.conductorText, this.conductorBubble, ['above', 'below']);

    // The charm falling off after a lucky save.
    const f = this.fallingCharm;
    if (f) {
      f.age += dt;
      f.vy += 300 * dt;
      f.y += f.vy * dt;
      f.x -= (25 + game.world.speed * 0.6) * dt;
      if (f.age > 0.9) this.fallingCharm = null;
      else this.ctx.drawImage(this.sprite('frontCharm2'), Math.round(f.x), Math.round(f.y));
    }

    // Sparkle bursts from collected pickups (gone in under half a second).
    if (this.bursts.length) {
      let k = 0;
      for (const b of this.bursts) {
        b.age += dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.age < BURST_TIME) this.bursts[k++] = b;
      }
      this.bursts.length = k;
      for (const b of this.bursts) {
        const sz = b.age < 0.2 ? 2 : 1;
        this.rect(b.x, b.y, sz, sz, b.col);
      }
    }

    // Popups: just above the bus (or just below it in the top lane), never on the road ahead.
    // Each lasts under a second.
    let n = 0;
    for (const p of this.popups) {
      p.age += dt;
      if (p.age < POPUP_TIME) this.popups[n++] = p;
    }
    this.popups.length = n;
    const r = this.busRect;
    this.popups.forEach((p, i) => {
      const tw = this.textWidth(p.text);
      const x = Math.max(1, Math.min(VIEW_W - 1 - tw, Math.round(r.x + r.w / 2 - tw / 2)));
      const rise = Math.round(p.age * 8);
      const above = r.y - 8 - i * 7 - rise;
      const y = above >= ROAD_TOP ? above : r.y + r.h + 2 + i * 7 + rise;
      if (p.age > POPUP_TIME - 0.25) this.ctx.globalAlpha = Math.max(0, (POPUP_TIME - p.age) / 0.25);
      this.text(p.text, x, y, p.color, 1, 'left', true);
      this.ctx.globalAlpha = 1;
    });

    // Captions: one at a time in the thin strip above the road, clear of the mute button.
    if (!this.caption && this.captionQueue.length) this.caption = { key: this.captionQueue.shift()!, age: 0 };
    const c = this.caption;
    if (c) {
      c.age += dt;
      if (c.age > CAPTION_TIME) this.caption = null;
      else {
        this.rect(0, 0, 232, ROAD_TOP, 'rgba(0,0,0,0.55)');
        this.text(CAPTIONS[c.key], 116, 2, '#ffffff', 1, 'center', false);
      }
    }
    void d;
  }

  // ---------------------------------------------------------------- HUD

  /** Everything in the HUD that never changes, rendered once. */
  private hudPanel(): HTMLCanvasElement {
    const top = HUD_TOP;
    return this.layer('hudPanel', VIEW_W, VIEW_H - top, (g) => {
      const R = (x: number, y: number, w: number, h: number, c: string) => this.rect(x, y - top, w, h, c, g);
      R(0, top, VIEW_W, VIEW_H - top, SCENE.hud);
      R(0, top, VIEW_W, 1, PALETTE.K);
      R(0, top + 1, VIEW_W, 1, SCENE.hudLight);
      R(0, VIEW_H - 1, VIEW_W, 1, SCENE.hudDark);
      for (const bx of [2, VIEW_W - 4]) {
        R(bx, top + 4, 2, 2, SCENE.hudDark);
        R(bx, VIEW_H - 5, 2, 2, SCENE.hudDark);
      }
      const BH = 23;
      const box = (x: number, y: number, w: number, h: number, fill: string) => {
        R(x - 1, y - 1, w + 2, h + 2, PALETTE.K);
        R(x, y, w, h, fill);
        R(x, y + h, w, 1, SCENE.hudDark);
      };
      box(6, top + 3, 68, BH, SCENE.lcdBg);
      g.drawImage(this.textImage('SCORE', SCENE.lcdOn, 1, false, FONT_SMALL), 9, 4);
      box(84, top + 3, 56, BH, SCENE.mapBg);
      for (let i = 1; i < ROUTE.length; i++) {
        const a = ROUTE[i - 1];
        const b = ROUTE[i];
        const steps = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), 1);
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          R(Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), 2, 2, SCENE.mapRoad);
        }
      }
      R(ROUTE[0][0] - 1, ROUTE[0][1] - 1, 3, 3, PALETTE.L);
      const end = ROUTE[ROUTE.length - 1];
      R(end[0], end[1] - 5, 1, 6, PALETTE.K);
      R(end[0] + 1, end[1] - 5, 3, 2, PALETTE.y);
      box(146, top + 3, 52, BH, SCENE.lcdBg);
      const cx = 171;
      const cy = top + 24;
      for (let a = 0; a <= 12; a++) {
        const ang = Math.PI + (a / 12) * Math.PI;
        const r = a % 3 === 0 ? 17 : 18;
        R(Math.round(cx + Math.cos(ang) * 19), Math.round(cy + Math.sin(ang) * 19), 1, 1, SCENE.lcdOff);
        R(Math.round(cx + Math.cos(ang) * r), Math.round(cy + Math.sin(ang) * r), 1, 1, a >= 10 ? PALETTE.R : SCENE.lcdOn);
      }
      box(202, top + 3, 48, BH, SCENE.lcdBg);
      const kmh = this.textImage('KM/H', SCENE.lcdOn, 1, false, FONT_SMALL);
      g.drawImage(kmh, 247 - kmh.width, 20);
    });
  }

  /** Speedometer needle for a given km/h, cached per value. */
  private needle(kmh: number): HTMLCanvasElement {
    return this.layer(`needle:${kmh}`, 32, 18, (g) => {
      const cx = 16;
      const cy = 16;
      const ang = Math.PI + Math.min(1, kmh / 120) * Math.PI;
      const ex = cx + Math.cos(ang) * 14;
      const ey = cy + Math.sin(ang) * 14;
      const steps = Math.max(Math.abs(ex - cx), Math.abs(ey - cy), 1);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        this.rect(Math.round(cx + (ex - cx) * t), Math.round(cy + (ey - cy) * t), 1, 1, PALETTE.y, g);
      }
      this.rect(cx - 1, cy - 1, 3, 3, PALETTE.L, g);
    });
  }

  private hud(game: Game, now: number, d: number): void {
    const w = game.world;
    const top = HUD_TOP;
    this.ctx.drawImage(this.hudPanel(), 0, top);
    this.text(`HI ${game.highScore}`, 71, top + 4, SCENE.lcdOn, 1, 'right', false);
    this.lcd(String(Math.min(99999, w.score)).padStart(5, ' '), 10, top + 10);
    this.charmIcon(game, now, 62, top + 10);
    const [px, py] = this.routePoint((d % ROUTE_DISTANCE) / ROUTE_DISTANCE);
    if (Math.floor(now * 4) % 2 === 0 || game.phase !== 'playing') this.rect(px - 1, py - 1, 3, 3, SCENE.mapDot);
    const kmh = Math.round(w.crashed || game.phase === 'title' ? 0 : w.speed * KMH_PER_SPEED);
    this.ctx.drawImage(this.needle(kmh), 171 - 16, top + 24 - 16);
    this.lcd(String(kmh).padStart(3, ' '), 205, top + 5);
  }

  /** HUD charm progress: ghost (empty), 1 chilli, 2 chillies, complete + blinking while boosted. */
  private charmIcon(game: Game, now: number, x: number, y: number): void {
    const c = game.world.charm;
    const stage = c.boostT > 0 ? 3 : c.chillies;
    const img = this.layer(`charmIcon:${stage}`, 9, 14, (g) => {
      if (stage === 0) {
        g.globalAlpha = 0.3;
        g.drawImage(this.sprite('charmFull'), 1, -2);
        g.globalAlpha = 1;
      } else if (stage === 1) {
        g.drawImage(this.sprite('charm2'), 1, -2);
        g.clearRect(5, 0, 4, 14); // only the first chilli
        g.globalAlpha = 0.3;
        g.drawImage(this.sprite('charm2'), 1, -2);
        g.globalAlpha = 1;
      } else g.drawImage(this.sprite(stage === 3 ? 'charmFull' : 'charm2'), 1, -2);
    });
    if (stage === 3 && Math.floor(now * 8) % 2 === 0) this.rect(x - 1, y - 1, 11, 16, '#ff7af0');
    this.ctx.drawImage(img, x, y);
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
    this.lastFill = SCENE.overlay;
    this.ctx.fillStyle = SCENE.overlay;
    this.ctx.fillRect(0, 0, VIEW_W, HUD_TOP);
  }

  private button(r: Rect, label: string, fill: string, scale: number, enabled: boolean): void {
    const img = this.layer(`button:${label}:${fill}:${scale}:${enabled}`, r.w + 2, r.h + 2, (g) => {
      this.rect(0, 0, r.w + 2, r.h + 2, PALETTE.K, g);
      this.rect(1, 1, r.w, r.h, enabled ? fill : PALETTE.g, g);
      this.rect(1, 1, r.w, 1, 'rgba(255,255,255,0.45)', g);
      this.rect(1, r.h - 1, r.w, 2, 'rgba(0,0,0,0.35)', g);
      const t = this.textImage(label, SCENE.text, scale, true, FONT_SMALL);
      const th = 5 * scale;
      g.drawImage(t, Math.round(1 + r.w / 2 - (t.width - scale) / 2), 1 + Math.round((r.h - th) / 2) - 1);
    });
    this.ctx.drawImage(img, r.x - 1, r.y - 1);
  }

  private muteIcon(muted: boolean): void {
    const m = UI_RECTS.mute;
    const img = this.layer(`mute:${muted}`, m.w + 2, m.h + 2, (g) => {
      this.rect(0, 0, m.w + 2, m.h + 2, PALETTE.K, g);
      this.rect(1, 1, m.w, m.h, SCENE.hud, g);
      const x = 1;
      const y = 1;
      this.rect(x + 3, y + 5, 2, 4, PALETTE.L, g);
      this.rect(x + 5, y + 4, 1, 6, PALETTE.L, g);
      this.rect(x + 6, y + 3, 1, 8, PALETTE.L, g);
      if (muted) {
        for (let i = 0; i < 5; i++) {
          this.rect(x + 9 + i, y + 4 + i, 1, 1, PALETTE.L, g);
          this.rect(x + 13 - i, y + 4 + i, 1, 1, PALETTE.L, g);
        }
      } else {
        this.rect(x + 9, y + 5, 1, 4, PALETTE.L, g);
        this.rect(x + 11, y + 4, 1, 6, PALETTE.L, g);
        this.rect(x + 13, y + 3, 1, 8, PALETTE.L, g);
      }
    });
    this.ctx.drawImage(img, m.x - 1, m.y - 1);
  }

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
