/** Logical-pixel rectangles shared by the canvas renderer and the HTML hit areas laid over it. */
export interface Rect { x: number; y: number; w: number; h: number }

export const UI_RECTS = {
  retry: { x: 36, y: 76, w: 80, h: 20 },
  share: { x: 124, y: 76, w: 100, h: 20 },
  mute: { x: 236, y: 3, w: 17, h: 13 },
} satisfies Record<string, Rect>;
