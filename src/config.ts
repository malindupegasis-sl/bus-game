/** Logical render resolution. Everything is drawn at this size and scaled up with nearest-neighbour. */
export const VIEW_W = 256;
export const VIEW_H = 144;

/**
 * Road geometry (logical pixels). Lanes are 33px so the 32px-tall bus fits inside one; the HUD
 * is 25px (it was 28: the 3 rows went to the play area, so lanes and hitboxes are unchanged) and
 * the roadside strips are thin to make room.
 */
export const LANE_COUNT = 3;
export const LANE_HEIGHT = 33;
export const ROAD_TOP = 10;
export const LANE_CENTER_Y = [26, 59, 92] as const;
export const ROAD_BOTTOM = ROAD_TOP + LANE_HEIGHT * LANE_COUNT; // 109
export const HUD_TOP = 119;
/** Vehicles are drawn with their bottom pixel row here, relative to the lane centre. */
export const VEHICLE_BASELINE = 15;
/** A lane's rows run from laneY − LANE_HALF_UP to laneY + LANE_HALF_DOWN (33 rows). */
export const LANE_HALF_UP = 16;
export const LANE_HALF_DOWN = 16;

/** Bus placement and feel. */
export const BUS_X = 12;
export const LANE_CHANGE_TIME = 0.13; // seconds for one smooth lane change

/** Obstacles spawn just off the right edge. */
export const SPAWN_X = VIEW_W + 4;

/** Distance (logical px travelled) per point of score. */
export const DISTANCE_PER_POINT = 8;

/** Displayed km/h per logical px/s of speed. */
export const KMH_PER_SPEED = 0.42;

export const GAME_TITLE = 'LANKAN BUS LEGENDZ';
export const MUSIC_CREDIT = 'Nandana Sihina Gange - Sangeeth Wijesuriya';
export const SPOTIFY_TRACK_URL = 'https://open.spotify.com/track/6RfVijJg41SYRH30EJGKhG';
export const SHARE_URL = 'https://malindupegasis-sl.github.io/bus-game/';

/**
 * Seamless loop points for public/audio/song.mp3 (seconds). Measured with ffmpeg: the file has
 * 0.70s of silence at the start, the music ends with a short tail around 204s, then ~4s of
 * silence. Looping 0.70 → 204.0 with a short crossfade avoids a ~4.6s gap. Update these if the
 * song file is replaced (the end is clamped to the file's real duration).
 */
export const SONG_LOOP = { start: 0.7, end: 204.0, crossfade: 0.18 } as const;

/** Music never plays faster than this (applies to the song file and the chiptune). */
export const MAX_MUSIC_RATE = 1.25;

export function laneY(lane: number): number {
  // Fractional lanes interpolate linearly between lane centres.
  return LANE_CENTER_Y[0] + lane * LANE_HEIGHT;
}
