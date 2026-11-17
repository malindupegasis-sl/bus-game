import type { Dir } from './game/game';

export interface InputHandlers {
  /** Tap (fires on touch-down for zero latency) or key press. */
  press(dir: Dir, gestureId?: number): void;
  /** The same gesture turned into a vertical swipe. */
  swipe(dir: Dir, gestureId: number): void;
  /** Enter / Space. */
  primary(): void;
  toggleMute(): void;
  /** Called from every event that counts as a user activation (needed to start audio on mobile). */
  unlock(): void;
}

const isUi = (t: EventTarget | null) => t instanceof Element && !!t.closest('button, a');

/**
 * Phone: tap the top or bottom half of the screen, or swipe up/down (both work).
 * Desktop: ↑/↓ or W/S. Also blocks scrolling, zooming, text selection and the context menu.
 */
export function attachInput(h: InputHandlers): void {
  let nextGesture = 0;
  const active = new Map<number, { x: number; y: number; id: number; swiped: boolean }>();

  window.addEventListener(
    'pointerdown',
    (e) => {
      if (isUi(e.target)) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      const id = ++nextGesture;
      active.set(e.pointerId, { x: e.clientX, y: e.clientY, id, swiped: false });
      h.unlock();
      h.press(e.clientY < window.innerHeight / 2 ? -1 : 1, id);
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
      h.swipe(dy < 0 ? -1 : 1, g.id);
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
    if (!isUi(e.target)) e.preventDefault();
  };
  for (const type of ['touchstart', 'touchmove', 'gesturestart', 'gesturechange', 'dblclick', 'contextmenu', 'selectstart']) {
    document.addEventListener(type, block, { passive: false });
  }
  document.addEventListener('wheel', (e) => e.ctrlKey && e.preventDefault(), { passive: false });

  window.addEventListener('keydown', (e) => {
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
