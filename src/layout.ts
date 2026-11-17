import { ROAD_BOTTOM, VIEW_H, VIEW_W } from './config';

export interface Box { x: number; y: number; w: number; h: number }
export interface Layout {
  canvas: Box;
  up: Box;
  down: Box;
  /** 'below': buttons sit in free space under the game. 'overlay': semi-transparent over it. */
  mode: 'below' | 'overlay';
}

const MARGIN = 12;

/**
 * Where the game canvas and the ▲/▼ buttons go, in CSS px within the stage's safe area.
 * The canvas is scaled by a whole number of device pixels when that fills the space well.
 * Overlay buttons are kept below the road so they can never cover the bus.
 */
export function computeLayout(w: number, h: number, dpr: number): Layout {
  const fit = (availW: number, availH: number) => {
    const k = Math.max(1, Math.floor(Math.min((availW * dpr) / VIEW_W, (availH * dpr) / VIEW_H)));
    let cw = (VIEW_W * k) / dpr;
    let ch = (VIEW_H * k) / dpr;
    // If whole-number scaling leaves the game small, fill the limiting dimension instead.
    if (cw < availW * 0.85 && ch < availH * 0.85) {
      const s = Math.min(availW / VIEW_W, availH / VIEW_H);
      cw = VIEW_W * s;
      ch = VIEW_H * s;
    }
    return { cw, ch };
  };

  const portraitSize = Math.round(Math.min(w * 0.42, 170, h * 0.25));
  const reserve = portraitSize + MARGIN * 2;
  const room = h - reserve;
  const { cw: pw, ch: ph } = fit(w, room);
  if (h > w && room >= ph) {
    // Portrait: the game in the space above, big buttons in the bottom corners.
    const canvas = { x: (w - pw) / 2, y: Math.max(0, (room - ph) / 2), w: pw, h: ph };
    const y = h - MARGIN - portraitSize;
    return {
      canvas,
      mode: 'below',
      up: { x: MARGIN, y, w: portraitSize, h: portraitSize },
      down: { x: w - MARGIN - portraitSize, y, w: portraitSize, h: portraitSize },
    };
  }

  // Landscape: the game fills the screen, buttons overlay the bottom corners below the road.
  const { cw, ch } = fit(w, h);
  const canvas = { x: (w - cw) / 2, y: (h - ch) / 2, w: cw, h: ch };
  const roadBottom = canvas.y + (ROAD_BOTTOM / VIEW_H) * ch;
  const size = Math.round(Math.max(56, Math.min(140, w * 0.2, h - roadBottom - 4 - MARGIN * 0.5)));
  const y = h - MARGIN * 0.5 - size;
  return {
    canvas,
    mode: 'overlay',
    up: { x: MARGIN, y, w: size, h: size },
    down: { x: w - MARGIN - size, y, w: size, h: size },
  };
}
