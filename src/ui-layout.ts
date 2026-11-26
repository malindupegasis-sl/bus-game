import { HUD_TOP } from './config';

/** Logical-pixel rectangles shared by the canvas renderer and the HTML hit areas laid over it. */
export interface Rect { x: number; y: number; w: number; h: number }

/**
 * Start screen, top to bottom (logical px): title on one line (y 5-20), the "Played N times"
 * flip counter (y 27-45), TAP TO START (y 54-66), "Driver: NAME · change name" (y 72-81), then the
 * Spotify music bubble anchored right, its bottom 3px above the HUD (HUD starts at 119).
 */
export const START = { titleY: 5, counterY: 27, tapY: 54, bubbleBottom: 116, bubbleRight: 252 } as const;

/** Flip-counter tile size (logical px), gap between tiles and the width a thousands comma takes. */
export const FLIP_TILE = { w: 12, h: 18, gap: 2, comma: 3 } as const;

export const UI_RECTS = {
  mute: { x: 236, y: 3, w: 17, h: 13 },
  /** "Driver: NAME · change name" on the start screen (see START). */
  name: { x: 48, y: 72, w: 160, h: 9 },
} satisfies Record<string, Rect>;


/**
 * HUD content (logical px). Kept inside x 37..219 so the landscape thumb buttons, which can reach
 * ~35px in from each side on 16:9 phones, never cover the score, the charm icon or the speed.
 */
export const HUD = {
  score: { x: 37, y: HUD_TOP + 1, w: 107, h: 23 },
  scoreDigits: { x: 62, y: HUD_TOP + 2, n: 5 },
  charmIcon: { x: 132, y: HUD_TOP + 5, w: 9, h: 14 },
  speed: { x: 150, y: HUD_TOP + 1, w: 69, h: 23 },
  speedDigits: { x: 154, y: HUD_TOP + 2, n: 3 },
  /** Small text rows inside the HUD (y offsets from HUD_TOP). */
  rows: { scoreLabel: 3, hiLabel: 10, hiValue: 17, kmh: 17 },
  /** Big seven-segment LCD digit size and spacing. */
  digit: { w: 12, h: 20, step: 14 },
} as const;
