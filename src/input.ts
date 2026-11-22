import type { Dir } from './game/game';

export interface InputHandlers {
  /** ▲/▼ button (fires on touch-down for zero latency) or arrow key. */
  press(dir: Dir): void;
  /** Vertical swipe anywhere outside the buttons. */
  swipe(dir: Dir): void;
  /** Tap anywhere outside the buttons (start / resume, never steers). Client coordinates. */
  tap(x: number, y: number): void;
  /** Enter / Space. */
  primary(): void;
  toggleMute(): void;
  /** Called from every event that counts as a user activation (needed to start audio on mobile). */
  unlock(): void;
}

const isUi = (t: EventTarget | null) => t instanceof Element && !!t.closest('button, a, input, .panel');

/**
 * Phone: the ▲ (bottom-left) and ▼ (bottom-right) buttons, or swipe up/down anywhere.
 * Desktop: ↑/↓ or W/S. Also blocks scrolling, zooming, text selection and the context menu.
 */
export function attachInput(h: InputHandlers, buttons: { el: HTMLElement; dir: Dir }[]): void {
  for (const { el, dir } of buttons) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.add('pressed');
      h.unlock();
      h.press(dir);
    });
    const release = () => el.classList.remove('pressed');
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(type, release);
    el.addEventListener('click', (e) => e.preventDefault());
  }

  const active = new Map<number, { x: number; y: number; swiped: boolean }>();

  window.addEventListener(
    'pointerdown',
    (e) => {
      if (isUi(e.target)) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      active.set(e.pointerId, { x: e.clientX, y: e.clientY, swiped: false });
      h.unlock();
      h.tap(e.clientX, e.clientY);
    },
    { passive: false },
  );

  window.addEventListener('pointermove', (e) => {
    const g = active.get(e.pointerId);
    if (!g || g.swiped) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    const threshold = Math.max(16, Math.min(36, window.innerHeight * 0.03));
    if (Math.abs(dy) >= threshold && Math.abs(dy) > Math.abs(dx) * 1.2) {
      g.swiped = true;
      h.swipe(dy < 0 ? -1 : 1);
    }
  });

  const end = (e: PointerEvent) => {
    active.delete(e.pointerId);
    h.unlock();
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', (e) => active.delete(e.pointerId));
  window.addEventListener('touchend', () => h.unlock());
  window.addEventListener('click', () => h.unlock());

  // No scrolling / pinch-zoom / double-tap zoom / long-press menus while playing.
  const block = (e: Event) => {
    const t = e.target;
    // Real buttons, links and the garage panel must keep their clicks (cancelling touchstart on a
    // phone cancels the click that follows). The thumb buttons act on pointerdown and have
    // touch-action: none, so they don't need this either way.
    if (!(t instanceof Element && t.closest('a, button, input, .panel'))) e.preventDefault();
  };
  for (const type of ['touchstart', 'touchmove', 'gesturestart', 'gesturechange', 'dblclick', 'contextmenu', 'selectstart']) {
    document.addEventListener(type, block, { passive: false });
  }
  document.addEventListener('wheel', (e) => e.ctrlKey && e.preventDefault(), { passive: false });

  window.addEventListener('keydown', (e) => {
    // Typing a name (or anything in a panel's form) never steers or starts the game.
    if (e.target instanceof Element && e.target.closest('input, textarea, #name-panel')) return;
    // A focused link (the creator credit) keeps its own Enter/Space: open it, don't start a run.
    if (e.target instanceof Element && e.target.closest('a[href]:not(#btn-share)')) return;
    const k = e.code;
    const handled = ['ArrowUp', 'ArrowDown', 'KeyW', 'KeyS', 'Space', 'Enter', 'KeyM'].includes(k);
    if (!handled) return;
    e.preventDefault();
    h.unlock();
    if (e.repeat) return;
    if (k === 'ArrowUp' || k === 'KeyW') h.press(-1);
    else if (k === 'ArrowDown' || k === 'KeyS') h.press(1);
    else if (k === 'KeyM') h.toggleMute();
    else h.primary();
  });
}
