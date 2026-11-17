import './style.css';
import { AudioManager } from './audio/audio';
import { MUSIC_CREDIT, VIEW_H, VIEW_W } from './config';
import { musicRateForSpeed, speedAt } from './game/difficulty';
import { Game, type Phase } from './game/game';
import { attachInput } from './input';
import { Renderer } from './render/renderer';
import { whatsappUrl } from './share';
import { computeLayout, type Box } from './layout';
import { DebugOverlay } from './debug';
import { creditFontPx, visibleArea } from './viewport';
import { HUD, UI_RECTS, type Rect } from './ui-layout';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const stage = $<HTMLDivElement>('#stage');
const wrap = $<HTMLDivElement>('#wrap');
const canvas = $<HTMLCanvasElement>('#screen');
const btnUp = $<HTMLButtonElement>('#btn-up');
const btnDown = $<HTMLButtonElement>('#btn-down');
const btnMute = $<HTMLButtonElement>('#btn-mute');
const btnRetry = $<HTMLButtonElement>('#btn-retry');
const btnShare = $<HTMLAnchorElement>('#btn-share');
const credit = $<HTMLParagraphElement>('#credit');
credit.textContent = MUSIC_CREDIT;

const renderer = new Renderer(canvas);
/** Knockout screen shake on/off (set in the debug overlay, remembered on this device). */
const SHAKE_KEY = 'busgame.shake';
try {
  renderer.shakeOn = localStorage.getItem(SHAKE_KEY) !== '0';
} catch {
  /* ignore */
}
const game = new Game();
const audio = new AudioManager();
renderer.muted = audio.muted;

// ------------------------------------------------------------ layout (rotation-safe)

function setBox(el: HTMLElement, b: Box): void {
  el.style.left = `${b.x}px`;
  el.style.top = `${b.y}px`;
  el.style.width = `${b.w}px`;
  el.style.height = `${b.h}px`;
}

/** Size the layout was last computed for (to detect missed rotation/resize events). */
let laidOut = { w: 0, h: 0 };

/**
 * Lay everything out for the real visible area. On iPhone (Safari and Chrome both use WebKit)
 * the toolbars change size when rotating and the old size is briefly reported mid-rotation, so
 * this runs on every resize-type event, again a few times after a rotation, and whenever the
 * main loop notices the visible area changed.
 */
function layout(): void {
  const v = visibleArea(window);
  if (v.zoomed) resetZoom();
  stage.style.left = `${v.left}px`;
  stage.style.top = `${v.top}px`;
  stage.style.width = `${v.w}px`;
  stage.style.height = `${v.h}px`;
  const cs = getComputedStyle(stage);
  const w = v.w - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const h = v.h - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const l = computeLayout(w, h, window.devicePixelRatio || 1);
  setBox(wrap, l.canvas);
  canvas.style.width = `${l.canvas.w}px`;
  canvas.style.height = `${l.canvas.h}px`;
  setBox(btnUp, l.up);
  setBox(btnDown, l.down);
  stage.dataset.controls = l.mode;
  credit.style.fontSize = `${creditFontPx(l.canvas.w / VIEW_W)}px`;
  laidOut = { w: v.w, h: v.h };
}

/** If the page somehow got zoomed (it shouldn't), re-apply the viewport tag to snap back to 1x. */
function resetZoom(): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) return;
  const content = meta.content;
  meta.content = `${content}, maximum-scale=1.0`;
  requestAnimationFrame(() => (meta.content = content));
}

let layoutQueued = false;
function scheduleLayout(): void {
  if (layoutQueued) return;
  layoutQueued = true;
  requestAnimationFrame(() => {
    layoutQueued = false;
    layout();
  });
}

/**
 * After a rotation iOS can report the old size for a moment, and animation frames can be held back
 * while it animates the turn, so lay out right away (not on the next frame) and check again a few
 * times on timers. layout() is cheap.
 */
function afterRotation(): void {
  layout();
  for (const ms of [100, 300, 600, 1000]) setTimeout(layout, ms);
}

function place(el: HTMLElement, r: Rect, grow = 0): void {
  el.style.left = `${((r.x - grow) / VIEW_W) * 100}%`;
  el.style.top = `${((r.y - grow) / VIEW_H) * 100}%`;
  el.style.width = `${((r.w + grow * 2) / VIEW_W) * 100}%`;
  el.style.height = `${((r.h + grow * 2) / VIEW_H) * 100}%`;
}
place(btnMute, UI_RECTS.mute, 6);
place(btnRetry, UI_RECTS.retry);
place(btnShare, UI_RECTS.share);

window.addEventListener('resize', afterRotation);
window.addEventListener('orientationchange', afterRotation);
screen.orientation?.addEventListener?.('change', afterRotation);
window.visualViewport?.addEventListener('resize', afterRotation);
window.visualViewport?.addEventListener('scroll', scheduleLayout);
if ('ResizeObserver' in window) new ResizeObserver(scheduleLayout).observe(document.documentElement);
layout();
// Safety net that doesn't depend on animation frames: re-layout if the visible area changed.
setInterval(() => {
  const v = visibleArea(window);
  if (Math.abs(v.w - laidOut.w) > 1 || Math.abs(v.h - laidOut.h) > 1) layout();
}, 400);

// ------------------------------------------------------------ debug overlay

/** The HUD score box, in logical px (tap it 5 times to toggle the overlay). */
const SCORE_BOX = HUD.score;

function isOnScore(clientX: number, clientY: number): boolean {
  const r = canvas.getBoundingClientRect();
  const x = ((clientX - r.left) / r.width) * VIEW_W;
  const y = ((clientY - r.top) / r.height) * VIEW_H;
  return x >= SCORE_BOX.x && x <= SCORE_BOX.x + SCORE_BOX.w && y >= SCORE_BOX.y && y <= SCORE_BOX.y + SCORE_BOX.h;
}

const debug = new DebugOverlay(() => {
  const s = audio.songState;
  const music = audio.source === 'song' && s
    ? `MUSIC song ${s.playing ? 'playing' : 'PAUSED'} ${s.time.toFixed(1)}s x${s.rate.toFixed(2)}${s.pitchKept ? '' : ' chipmunk'}`
    : `MUSIC ${audio.source}`;
  return [
    music,
    `AUDIO CTX ${audio.contextState}  recoveries ${audio.restarts}`,
    `LAST ${audio.lastEvent}`,
    `RUN ${game.phase} t=${game.world.t.toFixed(1)}s  vehicles ${game.world.obstacles.length}  particles ${renderer.particleCount}`,
    `CHARM chillies ${game.world.charm.chillies}${game.world.charm.boostT > 0 ? '  BOOST' : ''}${game.world.invincible ? '  invincible' : ''}  bonus ${game.world.bonus}`,
    `KNOCKOUTS ${game.world.knockouts}  combo x${game.world.combo.count}  wrecks ${renderer.fx.wreckCount}  fx ${renderer.fx.particleCount}`,
  ];
}, [
  {
    label: 'SCREEN SHAKE',
    get: () => renderer.shakeOn,
    set: (on) => {
      renderer.shakeOn = on;
      try {
        localStorage.setItem(SHAKE_KEY, on ? '1' : '0');
      } catch {
        /* ignore */
      }
    },
  },
]);

// ------------------------------------------------------------ input + audio

function flushEvents(): void {
  for (const e of game.world.drainEvents()) {
    renderer.onEvent(e);
    if (e.type === 'charm' && e.what === 'boostStart') audio.setBoost(true);
    else if (e.type === 'charm' && e.what === 'boostEnd') audio.setBoost(false);
    if (e.type === 'lane') audio.sfxLane();
    else if (e.type === 'crash') {
      audio.stopMusic();
      audio.sfxCrash();
      if (navigator.vibrate) navigator.vibrate(120);
    }
  }
}

function onRunStart(): void {
  audio.startMusic();
}

function toggleMute(): void {
  audio.setMuted(!audio.muted);
  renderer.muted = audio.muted;
  btnMute.setAttribute('aria-pressed', String(audio.muted));
  btnMute.setAttribute('aria-label', audio.muted ? 'Unmute' : 'Mute');
}

attachInput(
  {
    press(dir) {
      const r = game.press(dir);
      if (r === 'start') onRunStart();
      else if (r === 'resume') audio.resumeAll();
      flushEvents();
    },
    swipe(dir) {
      game.swipe(dir);
      flushEvents();
    },
    tap(x, y) {
      if (isOnScore(x, y)) debug.tap(performance.now());
      const r = game.tap();
      if (r === 'start') onRunStart();
      else if (r === 'resume') audio.resumeAll();
    },
    primary() {
      const r = game.primary();
      if (r === 'start' || r === 'retry') onRunStart();
      else if (r === 'resume') audio.resumeAll();
    },
    toggleMute,
    unlock: () => audio.unlock(),
  },
  [
    { el: btnUp, dir: -1 },
    { el: btnDown, dir: 1 },
  ],
);

btnMute.addEventListener('click', (e) => {
  e.stopPropagation();
  audio.unlock();
  toggleMute();
});
btnRetry.addEventListener('click', (e) => {
  e.stopPropagation();
  audio.unlock();
  if (game.retry()) onRunStart();
});
btnShare.addEventListener('click', (e) => {
  if (!game.canRetry()) e.preventDefault();
});

// Pause automatically when the page is hidden; the player taps to resume.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    game.pause();
    audio.suspend();
  } else if (game.phase !== 'paused') {
    audio.resumeAll();
  }
});
window.addEventListener('pagehide', () => {
  game.pause();
  audio.suspend();
});

// ------------------------------------------------------------ main loop

/** Fixed simulation step: 60 Hz. Rendering interpolates between steps (smooth on 120 Hz screens). */
const STEP = 1 / 60;
/** Never run more than this many catch-up steps in one frame (avoids a spiral after a stall). */
const MAX_STEPS = 5;
let last = performance.now();
let acc = 0;
let lastPhase: Phase | null = null;

function syncUi(): void {
  const over = game.phase === 'over';
  btnRetry.hidden = !over;
  btnShare.hidden = !over;
  btnMute.hidden = game.phase === 'crashed';
  credit.hidden = game.phase !== 'title';
  if (over) btnShare.href = whatsappUrl(game.world.score);
  document.body.dataset.phase = game.phase;
}

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < MAX_STEPS) {
    game.update(STEP);
    acc -= STEP;
    steps++;
  }
  if (steps === MAX_STEPS) acc = 0;
  flushEvents();
  // Music follows the base difficulty speed, not the boost's extra 1.3x (chipmunk mode handles that).
  if (game.phase === 'playing') audio.setRate(musicRateForSpeed(speedAt(game.world.t)));
  if (game.phase !== lastPhase || game.phase === 'over') {
    lastPhase = game.phase;
    syncUi();
  }
  audio.tick(now);
  const alpha = game.phase === 'playing' ? Math.min(1, acc / STEP) : 1;
  renderer.draw(game, now / 1000, alpha);
  debug.frame(now);
  requestAnimationFrame(frame);
}
syncUi();
requestAnimationFrame(frame);

// Browser-test hook. Production only gets a read-only snapshot (plain copies, no references), so
// nothing on the live site can clear the road or turn collisions off. The mutable objects are
// exposed in dev builds only; Vite removes that branch from production bundles.
const hook: Record<string, unknown> = {
  snapshot: () => ({
    phase: game.phase,
    t: game.world.t,
    speed: game.world.speed,
    target: game.world.bus.target,
    pos: game.world.bus.pos,
    score: game.world.score,
    highScore: game.highScore,
    obstacles: game.world.obstacles.length,
    audio: audio.source,
    song: audio.songState,
    muted: audio.muted,
    debug: debug.on,
    layout: { ...laidOut },
    chillies: game.world.charm.chillies,
    boosting: game.world.charm.boostT > 0,
    invincible: game.world.invincible,
    bonus: game.world.bonus,
    saves: game.world.saves,
    knockouts: game.world.knockouts,
    combo: game.world.combo.count,
    wrecks: renderer.fx.wreckCount,
    shake: renderer.shakeOn,
    pickups: game.world.pickups.length,
    kinds: game.world.obstacles.map((o) => o.kind),
    fps: debug.fps,
    audioCtx: audio.contextState,
    recoveries: audio.restarts,
  }),
};
if (import.meta.env.DEV) Object.assign(hook, { game, audio });
(window as unknown as { __busGame: unknown }).__busGame = Object.freeze(hook);
