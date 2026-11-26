import { HUD_TOP } from './config';

/** Logical-pixel rectangles shared by the canvas renderer and the HTML hit areas laid over it. */
export interface Rect { x: number; y: number; w: number; h: number }

/**
 * Start screen (logical px). The title, the "Played N times" flip counter and TAP TO START move
 * together as one group (offsets from the group's top; 61px tall in all), vertically centred
 * between the top of the screen and the top of the two bottom bubbles: the driver bubble bottom
 * left and the Spotify bubble bottom right, both with their bottoms 3px above the HUD (y 119) and
 * the same inset from their edges.
 */
export const START = {
  title: 0,
  counter: 22,
  tap: 49,
  groupH: 61,
  bubbleBottom: 116,
  bubbleInset: 4,
  /** Group top used until the bubbles have been measured. */
  defaultTop: 13,
} as const;

/**
 * Ticket counter (logical px): an 18×20 ticket machine with a 13px-tall ticket (5×7 text with
 * room for the comma's tail) coming out of a slot on its right, 4px below its top.
 */
export const TICKET = { machineW: 18, machineH: 20, h: 13, slotTop: 4, padL: 6, padR: 4 } as const;

export const UI_RECTS = {
  mute: { x: 236, y: 3, w: 17, h: 13 },
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
