/**
 * The real visible area in CSS px. visualViewport excludes the browser toolbars (Safari and Chrome
 * on iOS have different ones, and both resize when rotating); window.innerWidth/Height alone can be
 * stale or include hidden areas. If the page is zoomed, the size is converted back to 1x.
 */
export function visibleArea(win: {
  innerWidth: number;
  innerHeight: number;
  visualViewport?: { width: number; height: number; scale: number; offsetLeft: number; offsetTop: number } | null;
}): { w: number; h: number; left: number; top: number; zoomed: boolean } {
  const vv = win.visualViewport;
  if (!vv || !(vv.width > 0) || !(vv.height > 0)) {
    return { w: win.innerWidth, h: win.innerHeight, left: 0, top: 0, zoomed: false };
  }
  const zoomed = vv.scale > 1.01;
  return {
    w: Math.round(vv.width * vv.scale),
    h: Math.round(vv.height * vv.scale),
    left: zoomed ? 0 : Math.round(vv.offsetLeft),
    top: zoomed ? 0 : Math.round(vv.offsetTop),
    zoomed,
  };
}

/**
 * Music credit font size: about half the height of the old in-canvas pixel text (5 logical px tall,
 * cap height ~0.7 of the font size), but never below 8px so it stays readable on small portraits.
 */
export function creditFontPx(cssPerLogicalPx: number): number {
  return Math.max(8, Math.round(((5 * cssPerLogicalPx) / 2 / 0.7) * 10) / 10);
}
