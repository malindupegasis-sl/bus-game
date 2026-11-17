/**
 * Placeholder chiptune: an original, cheerful 8-bar loop (C – Am – F – G).
 * One token per 16th note: a note name, '-' to hold the previous note, '.' for silence.
 */
export const BPM = 150;

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const LEAD = [
  'E5 - G5 - C6 - G5 - E5 - G5 A5 G5 - E5 -',
  'A5 - C6 - E6 - C6 - A5 - G5 - E5 - D5 -',
  'F5 - A5 - C6 - A5 - F5 - A5 G5 F5 - D5 -',
  'G5 - B5 - D6 - B5 - G5 - A5 B5 C6 - - .',
  'E5 - G5 - C6 - G5 - E5 - G5 A5 G5 - E5 -',
  'A5 - C6 - E6 - C6 - A5 - G5 - E5 - D5 -',
  'F5 - A5 C6 F6 - E6 - C6 - A5 - G5 - F5 -',
  'G5 - - D6 - - B5 - G5 - - - . . . .',
].join(' ').split(' ');

const BASS_ROOTS = ['C3', 'A2', 'F2', 'G2', 'C3', 'A2', 'F2', 'G2'];
export const BASS = BASS_ROOTS.flatMap((root) => {
  const m = noteToMidi(root);
  const n = (x: number) => midiToName(x);
  return [n(m), '-', n(m + 12), '-', n(m), '-', n(m + 12), '-', n(m), '-', n(m + 12), '-', n(m + 7), '-', n(m + 12), '-'];
});

export const DRUMS = Array.from({ length: 8 }, (_, bar) =>
  (bar === 7 ? 'k.h.s.h.k.k.s.ss' : 'k.h.s.h.k.k.s.hh').split(''),
).flat();

export function noteToMidi(name: string): number {
  const m = /^([A-G]#?)(\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  return NAMES.indexOf(m[1]) + 12 * (parseInt(m[2], 10) + 1);
}

export function midiToName(m: number): string {
  return `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
}

export function midiToFreq(m: number): number {
  return 440 * 2 ** ((m - 69) / 12);
}

/** Length (in steps) of the note starting at `i`, counting following '-' holds. */
export function noteLength(track: readonly string[], i: number): number {
  let n = 1;
  while (track[(i + n) % track.length] === '-' && n < track.length) n++;
  return n;
}
