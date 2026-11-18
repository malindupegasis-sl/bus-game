import { HUD_TOP } from './config';

/** Logical-pixel rectangles shared by the canvas renderer and the HTML hit areas laid over it. */
export interface Rect { x: number; y: number; w: number; h: number }

export const UI_RECTS = {
  mute: { x: 236, y: 3, w: 17, h: 13 },
  /** "Driver: NAME · change" on the start screen, under the music credit. */
  name: { x: 48, y: 101, w: 160, h: 11 },
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
