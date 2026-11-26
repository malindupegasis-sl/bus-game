import './style.css';
import { AudioManager } from './audio/audio';
import { MUSIC_CREDIT, SPOTIFY_TRACK_URL, VIEW_H, VIEW_W } from './config';
import { musicRateForSpeed, speedAt } from './game/difficulty';
import { Game, type Phase } from './game/game';
import { attachInput } from './input';
import { MUTE_GROW, Renderer } from './render/renderer';
import { whatsappUrl } from './share';
import { computeLayout, type Box } from './layout';
import { DebugOverlay } from './debug';
import { visibleArea } from './viewport';
import { HUD, START, UI_RECTS, type Rect } from './ui-layout';
import { SupabaseLeaderboard, type Board } from './leaderboard/api';
import { loadName, saveName } from './leaderboard/nickname';
import { NamePanel, OverPanel } from './ui/panels';
import { scoreBucket, track } from './analytics';
import { deviceId } from './leaderboard/device';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const stage = $<HTMLDivElement>('#stage');
const wrap = $<HTMLDivElement>('#wrap');
const canvas = $<HTMLCanvasElement>('#screen');
const btnUp = $<HTMLButtonElement>('#btn-up');
const btnDown = $<HTMLButtonElement>('#btn-down');
const btnMute = $<HTMLButtonElement>('#btn-mute');
const btnRetry = $<HTMLButtonElement>('#btn-retry');
const btnShare = $<HTMLAnchorElement>('#btn-share');
const musicBubble = $<HTMLAnchorElement>('#music-bubble');
const btnName = $<HTMLButtonElement>('#btn-name');
const driverBubble = btnName; // the whole driver bubble is the "Change name" button
const driverName = $<HTMLSpanElement>('#driver-name');
musicBubble.href = SPOTIFY_TRACK_URL;
$<HTMLSpanElement>('#music-text').textContent = MUSIC_CREDIT;
musicBubble.setAttribute('aria-label', `Listen to ${MUSIC_CREDIT} on Spotify`);

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

// ------------------------------------------------------------ nickname + leaderboard

const leaderboard = new SupabaseLeaderboard();
const namePanel = new NamePanel();
const overPanel = new OverPanel();
let nickname: string | null = loadName();

function showName(): void {
  driverName.textContent = `Driver: ${nickname ?? '?'}`;
  btnName.setAttribute('aria-label', `${driverName.textContent}. Change name`);
  placeBubbles();
}

function askName(first: boolean): void {
  namePanel.open(nickname, !first, (name) => {
    if (name) {
      nickname = name;
      saveName(name);
    }
    showName();
    syncUi();
  });
}

/** The leaderboard for the run that just ended (null = loading or unavailable). */
let board: Board | null = null;
let boardRun = 0;
/** The leaderboard request for this run has finished (loaded or failed), and whether that was counted. */
let boardLoaded = false;
let boardTracked = false;

function submitRun(): void {
  const run = ++boardRun;
  board = null;
  boardLoaded = !leaderboard.configured || !nickname;
  boardTracked = false;
  overPanel.setBoard({ kind: leaderboard.configured ? 'loading' : 'unavailable' }, nickname ?? '');
  if (!nickname || !leaderboard.configured) return;
  const name = nickname;
  void leaderboard.submitAndLoad(name, game.world.score, game.world.t, deviceId()).then((b) => {
    if (run !== boardRun) return; // a newer run started meanwhile
    board = b;
    boardLoaded = true;
    overPanel.setBoard(b ? { kind: 'loaded', board: b } : { kind: 'unavailable' }, name);
    syncUi();
  });
}

// ------------------------------------------------------------ play counter ("Played N times")

/** Refresh the count this often while the start screen is showing (ms). */
const PLAYS_REFRESH = 30_000;
let playsLoading = false;
let playsAt = 0;

/** Load the total (start screen only). A failure hides the line; nothing ever waits for this. */
function refreshPlays(appeared: boolean): void {
  if (playsLoading || !leaderboard.configured) return;
  playsLoading = true;
  playsAt = performance.now();
  void leaderboard.playCount().then((n) => {
    playsLoading = false;
    if (n === null) renderer.plays.hide(); // can't load: hide the line, never show 0
    else if (appeared) renderer.plays.appear(n); // start screen appeared: N-1 flips to N
    else renderer.plays.raise(n); // 30 s refresh: flip through to a higher total
  });
}
setInterval(() => {
  if (game.phase === 'title' && document.visibilityState === 'visible' && performance.now() - playsAt >= PLAYS_REFRESH - 500) refreshPlays(false);
}, 5_000);

/** Share text gets the player's rank (and the best score it's for) when the leaderboard has it. */
function shareHref(): string {
  const me = board?.me;
  if (me && me.rank !== null && me.best !== null) return whatsappUrl(me.best, undefined, me.rank);
  return whatsappUrl(game.world.score);
}

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
  lastLayout = l;
  placeBubbles();
  laidOut = { w: v.w, h: v.h };
}

let lastLayout: ReturnType<typeof computeLayout> | null = null;

/**
 * The two start-screen bubbles: driver bottom left, Spotify bottom right. Fixed CSS size (the
 * Spotify icon must stay at least 21px), bottoms just above the HUD, and the SAME inset from their
 * edges so they mirror each other; in landscape the inset grows just enough to clear the ▲/▼
 * thumb buttons. A long driver name is shortened (…) only if the two would otherwise meet. The
 * title group is then centred between the top of the screen and the top of the bubbles.
 */
function placeBubbles(): void {
  const l = lastLayout;
  if (!l) return;
  const s = l.canvas.w / VIEW_W;
  const cw = l.canvas.w;
  driverName.style.maxWidth = '';
  const bh = Math.max(musicBubble.offsetHeight, driverBubble.offsetHeight);
  const bottom = START.bubbleBottom * s;
  const top = bottom - bh;
  let inset = START.bubbleInset * s;
  const gap = 6;
  const clash = (b: { x: number; y: number; w: number; h: number }) => {
    const y = b.y - l.canvas.y;
    return y < bottom && y + b.h > top;
  };
  // Thumb buttons overlapping the bubble row (landscape): move both bubbles inwards, equally.
  if (clash(l.up)) inset = Math.max(inset, l.up.x + l.up.w - l.canvas.x + gap);
  if (clash(l.down)) inset = Math.max(inset, l.canvas.x + cw - l.down.x + gap);
  const mw = musicBubble.offsetWidth;
  // Room left for the driver bubble; shorten the name line if needed (never the Spotify credit).
  const room = cw - 2 * inset - mw - 8;
  if (driverBubble.offsetWidth > room) {
    const extra = driverBubble.offsetWidth - room;
    driverName.style.maxWidth = `${Math.max(40, driverName.offsetWidth - extra)}px`;
  }
  driverBubble.style.left = `${Math.round(inset)}px`;
  driverBubble.style.top = `${Math.round(top)}px`;
  musicBubble.style.left = `${Math.round(cw - inset - mw)}px`;
  musicBubble.style.top = `${Math.round(top)}px`;
  // Centre the title group in the space above the bubbles (logical px).
  const free = top / s;
  renderer.startTop = Math.max(2, Math.round((free - START.groupH) / 2));
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
place(btnMute, UI_RECTS.mute, MUTE_GROW);

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
    ? `MUSIC song ${s.playing ? 'playing' : 'PAUSED'} ${s.time.toFixed(1)}s x${s.rate.toFixed(2)}${audio.boosting ? ' (boost)' : ''}`
    : `MUSIC ${audio.source}`;
  return [
    music,
    `AUDIO CTX ${audio.contextState}  recoveries ${audio.restarts}`,
    ...audio.log.slice(-6).map((l) => `  ${l}`),
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
    if (e.type === 'charm' && e.what === 'boostStart') {
      audio.setBoost(true);
      track('boost');
    }
    else if (e.type === 'charm' && e.what === 'boostEnd') audio.setBoost(false);
    if (e.type === 'lane') audio.sfxLane();
    else if (e.type === 'crash') {
      track(scoreBucket(game.world.score));
      submitRun();
      audio.stopMusic();
      audio.sfxCrash();
      if (navigator.vibrate) navigator.vibrate(120);
    }
  }
}

function onRunStart(): void {
  track('run-start');
  // +1 on the shared counter. Not awaited: a slow or failed call never delays the run.
  void leaderboard.addPlay(deviceId());
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
      if (namePanel.isOpen) return;
      const r = game.press(dir);
      if (r === 'start') onRunStart();
      else if (r === 'resume') audio.resumeAll();
      flushEvents();
    },
    swipe(dir) {
      if (namePanel.isOpen) return;
      game.swipe(dir);
      flushEvents();
    },
    tap(x, y) {
      if (isOnScore(x, y)) debug.tap(performance.now());
      if (namePanel.isOpen) return;
      const r = game.tap();
      if (r === 'start') onRunStart();
      else if (r === 'resume') audio.resumeAll();
    },
    primary() {
      if (namePanel.isOpen) return;
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
  else track('share-whatsapp');
});

// Pause automatically when the page is hidden; the player taps to resume.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    game.pause();
    audio.suspend();
  } else {
    if (game.phase !== 'paused') audio.resumeAll();
    if (game.phase === 'title') refreshPlays(true); // back from another tab or app: the start screen appears again
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
  if (over && !overPanel.visible) overPanel.show(game.world.score, game.highScore, game.newBest);
  else if (!over && overPanel.visible) overPanel.hide();
  const ready = game.canRetry();
  btnRetry.disabled = !ready;
  btnShare.setAttribute('aria-disabled', String(!ready));
  btnMute.hidden = game.phase === 'crashed' || over;
  musicBubble.dataset.off = String(game.phase !== 'title' || namePanel.isOpen);
  driverBubble.dataset.off = musicBubble.dataset.off;
  if (over) btnShare.href = shareHref();
  // Leaderboard seen on the game-over screen (once per run): loaded, or "unavailable".
  if (over && boardLoaded && !boardTracked) {
    boardTracked = true;
    track(board ? 'leaderboard-viewed' : 'leaderboard-unavailable');
  }
  document.body.dataset.phase = game.phase;
}
showName();
// First launch: ask for a name before the very first run.
if (!nickname) askName(true);
btnName.addEventListener('click', (e) => {
  e.stopPropagation();
  if (game.phase === 'title' && !namePanel.isOpen) {
    askName(false);
    syncUi();
  }
});

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
    if (game.phase === 'title' && game.phase !== lastPhase) refreshPlays(true); // start screen appeared
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
    plays: renderer.plays.final,
    playsTiles: renderer.plays.tiles().map((t) => t.to).join(''),
    startBoxes: { ...renderer.startBoxes },
    nickname,
    namePanel: namePanel.isOpen,
    leaderboard: board ? { top: board.top.length, rank: board.me?.rank ?? null, total: board.me?.total ?? null, rejected: board.rejected } : null,
    boardText: (document.querySelector('#over') as HTMLElement).innerText,
    share: btnShare.href ? decodeURIComponent(btnShare.href.replace(/^.*\?text=/, '')) : '',
    audioLog: [...audio.log],
  }),
};
if (import.meta.env.DEV) Object.assign(hook, { game, audio, renderer });
(window as unknown as { __busGame: unknown }).__busGame = Object.freeze(hook);
