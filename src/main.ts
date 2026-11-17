import './style.css';
import { AudioManager } from './audio/audio';
import { VIEW_H, VIEW_W } from './config';
import { musicRateForSpeed } from './game/difficulty';
import { Game, type Phase } from './game/game';
import { attachInput } from './input';
import { Renderer } from './render/renderer';
import { whatsappUrl } from './share';
import { UI_RECTS, type Rect } from './ui-layout';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const stage = $<HTMLDivElement>('#stage');
const wrap = $<HTMLDivElement>('#wrap');
const canvas = $<HTMLCanvasElement>('#screen');
const padUp = $<HTMLDivElement>('#pad-up');
const padDown = $<HTMLDivElement>('#pad-down');
const btnMute = $<HTMLButtonElement>('#btn-mute');
const btnRetry = $<HTMLButtonElement>('#btn-retry');
const btnShare = $<HTMLAnchorElement>('#btn-share');

const renderer = new Renderer(canvas);
const game = new Game();
const audio = new AudioManager();
renderer.touchHint = window.matchMedia('(pointer: coarse)').matches;
renderer.muted = audio.muted;

// ------------------------------------------------------------ layout

/** Scale the 256×144 canvas by the largest whole number of *device* pixels that fits. */
function layout(): void {
  const cs = getComputedStyle(stage);
  const availW = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const availH = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const dpr = window.devicePixelRatio || 1;
  const k = Math.max(1, Math.floor(Math.min((availW * dpr) / VIEW_W, (availH * dpr) / VIEW_H)));
  let cssW = (VIEW_W * k) / dpr;
  let cssH = (VIEW_H * k) / dpr;
  // If whole-number scaling leaves the game tiny (e.g. dpr 1 phones), fill the width instead.
  if (cssW < availW * 0.8 && availW / VIEW_W < availH / VIEW_H) {
    cssW = availW;
    cssH = (availW * VIEW_H) / VIEW_W;
  }
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  wrap.style.width = `${cssW}px`;
  wrap.style.height = `${cssH}px`;
  // Portrait: show the ▲ / ▼ pads in the free space above and below the game.
  const free = (availH - cssH) / 2;
  stage.classList.toggle('with-pads', free >= 64);
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

window.addEventListener('resize', layout);
window.visualViewport?.addEventListener('resize', layout);
layout();
void padUp;
void padDown;

// ------------------------------------------------------------ input + audio

function flushEvents(): void {
  for (const e of game.world.drainEvents()) {
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

attachInput({
  press(dir, gid) {
    const r = game.press(dir, gid);
    if (r === 'start') onRunStart();
    else if (r === 'resume') audio.resumeAll();
    flushEvents();
  },
  swipe(dir, gid) {
    game.swipe(dir, gid);
    flushEvents();
  },
  primary() {
    const r = game.primary();
    if (r === 'start' || r === 'retry') onRunStart();
    else if (r === 'resume') audio.resumeAll();
  },
  toggleMute,
  unlock: () => audio.unlock(),
});

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

const STEP = 1 / 120;
let last = performance.now();
let acc = 0;
let lastPhase: Phase | null = null;

function syncUi(): void {
  const over = game.phase === 'over';
  btnRetry.hidden = !over;
  btnShare.hidden = !over;
  btnMute.hidden = game.phase === 'crashed';
  if (over) btnShare.href = whatsappUrl(game.world.score);
  document.body.dataset.phase = game.phase;
}

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  while (acc >= STEP) {
    game.update(STEP);
    acc -= STEP;
  }
  flushEvents();
  if (game.phase === 'playing') audio.setRate(musicRateForSpeed(game.world.speed));
  if (game.phase !== lastPhase || game.phase === 'over') {
    lastPhase = game.phase;
    syncUi();
  }
  renderer.draw(game, now / 1000);
  requestAnimationFrame(frame);
}
syncUi();
requestAnimationFrame(frame);

// Read-only hook for automated browser tests.
(window as unknown as { __busGame: unknown }).__busGame = { game, audio };
