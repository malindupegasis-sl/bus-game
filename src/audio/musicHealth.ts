/**
 * Music watchdog decisions (pure, so it can be unit tested). Called a few times a second while a
 * run is on. iOS can pause the song element (audio-session interruptions: calls, Siri, other
 * apps, another media element starting) or interrupt the AudioContext; we recover on our own.
 */
export interface MusicObservation {
  /** We want music now (run in progress, page visible, not paused by the game). */
  want: boolean;
  usingSong: boolean;
  songPaused: boolean;
  songTime: number;
  /** Song time at the previous check, and how long (s) it has not advanced while "playing". */
  lastSongTime: number;
  stuckFor: number;
  ctxState: AudioContextState | 'interrupted' | 'none';
}

export type MusicAction = 'none' | 'play' | 'reload' | 'resume-ctx';

/** Seconds without progress before we nudge, and before we reload the element. */
export const STUCK_PLAY_AFTER = 1.0;
export const STUCK_RELOAD_AFTER = 4.0;

export function musicAction(o: MusicObservation): MusicAction {
  if (!o.want) return 'none';
  // The AudioContext drives sound effects and the chiptune fallback.
  if (o.ctxState === 'suspended' || o.ctxState === 'interrupted') return 'resume-ctx';
  if (!o.usingSong) return 'none';
  if (o.songPaused) return 'play';
  if (o.stuckFor >= STUCK_RELOAD_AFTER) return 'reload';
  if (o.stuckFor >= STUCK_PLAY_AFTER) return 'play';
  return 'none';
}
