/** Logical render resolution. Everything is drawn at this size and scaled up with nearest-neighbour. */
export const VIEW_W = 256;
export const VIEW_H = 144;

/** Road geometry (logical pixels). */
export const LANE_COUNT = 3;
export const LANE_HEIGHT = 24;
export const ROAD_TOP = 28;
export const LANE_CENTER_Y = [40, 64, 88] as const;
export const ROAD_BOTTOM = ROAD_TOP + LANE_HEIGHT * LANE_COUNT; // 100
export const HUD_TOP = 112;

/** Bus placement and feel. */
export const BUS_X = 12;
export const LANE_CHANGE_TIME = 0.13; // seconds for one smooth lane change

/** Obstacles spawn just off the right edge. */
export const SPAWN_X = VIEW_W + 4;

/** Distance (logical px travelled) per point of score. */
export const DISTANCE_PER_POINT = 8;

/** Displayed km/h per logical px/s of speed. */
export const KMH_PER_SPEED = 0.42;

export const GAME_TITLE = 'Bus Game';
export const SHARE_URL = 'https://malindupegasis-sl.github.io/bus-game/';

/** Music never plays faster than this (applies to the song file and the chiptune). */
export const MAX_MUSIC_RATE = 1.25;

export function laneY(lane: number): number {
  // Fractional lanes interpolate linearly between lane centres.
  return LANE_CENTER_Y[0] + lane * LANE_HEIGHT;
}
