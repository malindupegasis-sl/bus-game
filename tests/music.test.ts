import { describe, expect, it } from 'vitest';
import { BASS, DRUMS, LEAD, midiToFreq, noteLength, noteToMidi } from '../src/audio/music';

describe('chiptune placeholder', () => {
  it('all tracks are the same length (8 bars of 16ths) and parse', () => {
    expect(LEAD).toHaveLength(128);
    expect(BASS).toHaveLength(128);
    expect(DRUMS).toHaveLength(128);
    for (const n of [...LEAD, ...BASS]) if (n !== '-' && n !== '.') expect(() => noteToMidi(n)).not.toThrow();
  });
  it('note helpers', () => {
    expect(noteToMidi('A4')).toBe(69);
    expect(midiToFreq(69)).toBe(440);
    expect(noteLength(['C4', '-', '-', 'D4'], 0)).toBe(3);
  });
});
