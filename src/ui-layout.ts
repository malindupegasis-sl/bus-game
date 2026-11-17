import { HUD_TOP } from './config';

/** Logical-pixel rectangles shared by the canvas renderer and the HTML hit areas laid over it. */
export interface Rect { x: number; y: number; w: number; h: number }

export const UI_RECTS = {
  retry: { x: 36, y: 76, w: 80, h: 20 },
  share: { x: 124, y: 76, w: 100, h: 20 },
  mute: { x: 236, y: 3, w: 17, h: 13 },
  /** Title screen: opens the garage. */
  garage: { x: 192, y: 49, w: 56, h: 15 },
  /** Title screen: switches route (138 city / 1 Kandy). */
  route: { x: 6, y: 49, w: 66, h: 15 },
} satisfies Record<string, Rect>;


/**
 * HUD content (logical px). Kept inside x 37..219 so the landscape thumb buttons, which can reach
 * ~35px in from each side on 16:9 phones, never cover the score, the charm icon or the speed.
 */
export const HUD = {
  score: { x: 37, y: HUD_TOP + 2, w: 107, h: 25 },
  scoreDigits: { x: 62, y: HUD_TOP + 4, n: 5 },
  charmIcon: { x: 132, y: HUD_TOP + 7, w: 9, h: 14 },
  speed: { x: 150, y: HUD_TOP + 2, w: 69, h: 25 },
  speedDigits: { x: 154, y: HUD_TOP + 4, n: 3 },
  /** Big seven-segment LCD digit size and spacing. */
  digit: { w: 12, h: 20, step: 14 },
} as const;
