import { MAX_MUSIC_RATE, SONG_LOOP } from '../config';
import { BASS, BPM, DRUMS, LEAD, midiToFreq, noteLength, noteToMidi } from './music';

const MUTE_KEY = 'busgame.muted';
const SONG_URL = `${import.meta.env.BASE_URL}audio/song.mp3`;

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * All game audio. Nothing makes a sound until `unlock()` runs inside a user gesture
 * (mobile browsers require this). If public/audio/song.mp3 exists it is used as the music,
 * otherwise a Web Audio chiptune plays. Either way music speeds up with the game, capped at 1.25x.
 */
export class AudioManager {
  muted = loadMuted();
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private pulse: PeriodicWave | null = null;
  private noise: AudioBuffer | null = null;

  private songAvailable = false;
  /** Two copies of the song that hand over to each other for a gapless, crossfaded loop. */
  private songs: { el: HTMLAudioElement; gain: GainNode | null; blessed: boolean }[] = [];
  /** play() was refused for lack of a user gesture; retry on the next one. */
  private pendingResume = false;
  private songIdx = 0;
  private songTimer: number | null = null;
  private fading = false;
  private usingSong = false;

  private wantMusic = false;
  private playing = false;
  private rate = 1;
  private step = 0;
  private nextStepTime = 0;
  private timer: number | null = null;

  constructor() {
    void this.probeSong();
  }

  /** Is there a real song file? (Dev servers answer missing files with index.html, so check the type.) */
  private async probeSong(): Promise<void> {
    try {
      const res = await fetch(SONG_URL, { method: 'HEAD', cache: 'no-store' });
      const type = res.headers.get('content-type') ?? '';
      this.songAvailable = res.ok && !type.includes('text/html');
    } catch {
      this.songAvailable = false;
    }
  }

  get source(): 'song' | 'chiptune' | 'none' {
    return !this.playing ? 'none' : this.usingSong ? 'song' : 'chiptune';
  }

  /** Call from every user-gesture handler. Cheap after the first time. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        this.ctx = ctx;
        this.master = ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.55;
        this.master.connect(ctx.destination);
        this.musicBus = ctx.createGain();
        this.musicBus.gain.value = 0.5;
        this.musicBus.connect(this.master);
        this.pulse = makePulseWave(ctx, 0.25);
        this.noise = makeNoise(ctx);
        // A silent blip finishes the unlock on older iOS.
        const src = ctx.createBufferSource();
        src.buffer = ctx.createBuffer(1, 1, 22050);
        src.connect(ctx.destination);
        src.start(0);
      }
      if (this.ctx.state !== 'running' && document.visibilityState === 'visible') void this.ctx.resume();
      if (this.songAvailable && this.songs.length === 0) this.createSongs();
      this.blessSongs();
      if (this.pendingResume && this.playing && this.usingSong) {
        this.pendingResume = false;
        this.resumeSongs();
      }
      if (this.wantMusic && !this.playing) this.beginMusic();
    } catch {
      /* audio is optional */
    }
  }

  startMusic(): void {
    this.stopMusic();
    this.wantMusic = true;
    this.rate = 1;
    if (this.ctx) this.beginMusic();
  }

  private beginMusic(): void {
    if (!this.ctx) return;
    this.playing = true;
    if (this.songs.length) {
      this.usingSong = true;
      this.playSongFrom(SONG_LOOP.start);
    } else {
      this.usingSong = false;
      this.startSequencer();
    }
  }

  stopMusic(): void {
    this.wantMusic = false;
    this.playing = false;
    this.stopSequencer();
    this.stopSongs();
  }

  /** Page hidden / game paused. */
  suspend(): void {
    this.stopSequencer();
    this.pauseSongs();
    void this.ctx?.suspend();
  }

  resumeAll(): void {
    if (!this.ctx) return;
    void this.ctx.resume();
    if (!this.playing) return;
    if (this.usingSong) this.resumeSongs();
    else this.startSequencer();
  }

  setRate(r: number): void {
    this.rate = Math.max(0.5, Math.min(MAX_MUSIC_RATE, r));
    for (const s of this.songs) if (s.el.playbackRate !== this.rate) s.el.playbackRate = this.rate;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    try {
      localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.master && this.ctx) this.master.gain.setValueAtTime(m ? 0 : 0.55, this.ctx.currentTime);
    if (!this.master) for (const s of this.songs) s.el.muted = m;
  }

  // ------------------------------------------------------------ song file

  private createSongs(): void {
    for (let i = 0; i < 2; i++) {
      const el = new Audio(SONG_URL);
      el.preload = 'auto';
      el.loop = false; // looped by hand between SONG_LOOP points, with a crossfade
      el.preservesPitch = true;
      (el as unknown as { webkitPreservesPitch: boolean }).webkitPreservesPitch = true;
      el.addEventListener('error', () => this.songFailed());
      let gain: GainNode | null = null;
      if (this.ctx && this.musicBus) {
        try {
          gain = this.ctx.createGain();
          gain.gain.value = 0;
          this.ctx.createMediaElementSource(el).connect(gain).connect(this.master!);
        } catch {
          gain = null;
        }
      }
      if (!gain) el.muted = this.muted;
      this.songs.push({ el, gain, blessed: false });
    }
  }

  /** Mobile browsers refuse play() until a real gesture: wait for one instead of giving up. */
  private onPlayError(e: unknown): void {
    const name = e instanceof DOMException ? e.name : '';
    if (name === 'NotAllowedError') this.pendingResume = true;
    else if (name !== 'AbortError') this.songFailed(); // AbortError = interrupted by pause(), harmless
  }

  /**
   * iOS only lets an <audio> element play later if it was started once inside a gesture. Start
   * each idle copy muted for a moment during a gesture so the loop hand-over is allowed.
   */
  private blessSongs(): void {
    this.songs.forEach((s, i) => {
      if (s.blessed || (i === this.songIdx && this.usingSong && this.playing)) return;
      const wasMuted = s.el.muted;
      s.el.muted = true;
      s.el
        .play()
        .then(() => {
          s.blessed = true;
          if (!(i === this.songIdx && this.usingSong && this.playing && !this.fading)) {
            s.el.pause();
            s.el.currentTime = SONG_LOOP.start;
          }
          s.el.muted = wasMuted;
        })
        .catch(() => {
          s.el.muted = wasMuted;
        });
    });
  }

  /** The file couldn't be loaded or decoded: fall back to the chiptune for good. */
  private songFailed(): void {
    if (!this.songs.length) return;
    this.stopSongs();
    this.songs = [];
    this.songAvailable = false;
    this.usingSong = false;
    if (this.playing) this.startSequencer();
  }

  private loopEnd(el: HTMLAudioElement): number {
    const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : Infinity;
    return Math.min(SONG_LOOP.end, dur - 0.05);
  }

  private setSongVolume(i: number, v: number, at?: number): void {
    const s = this.songs[i];
    if (!s) return;
    if (s.gain && this.ctx) {
      const t = this.ctx.currentTime;
      s.gain.gain.cancelScheduledValues(t);
      if (at === undefined) s.gain.gain.setValueAtTime(v, t);
      else {
        s.gain.gain.setValueAtTime(s.gain.gain.value, t);
        s.gain.gain.linearRampToValueAtTime(v, t + at);
      }
    } else {
      s.el.volume = v;
    }
  }

  private playSongFrom(t: number): void {
    this.stopSongs();
    this.songIdx = 0;
    const cur = this.songs[0].el;
    cur.currentTime = t;
    cur.playbackRate = this.rate;
    this.setSongVolume(0, 1);
    this.primeNext();
    cur.play().then(() => (this.songs[0].blessed = true)).catch((e) => this.onPlayError(e));
    this.startSongTimer();
  }

  /** Park the idle copy at the loop start so the hand-over starts instantly. */
  private primeNext(): void {
    const next = this.songs[1 - this.songIdx];
    if (!next) return;
    next.el.pause();
    next.el.currentTime = SONG_LOOP.start;
    this.setSongVolume(1 - this.songIdx, 0);
  }

  private startSongTimer(): void {
    if (this.songTimer !== null) return;
    this.songTimer = window.setInterval(() => this.checkLoop(), 20);
  }

  private checkLoop(): void {
    if (!this.usingSong || this.fading) return;
    const cur = this.songs[this.songIdx];
    if (!cur || cur.el.paused) return;
    const remaining = (this.loopEnd(cur.el) - cur.el.currentTime) / this.rate;
    if (remaining > SONG_LOOP.crossfade) return;
    // Crossfade into the other copy, already parked at the loop start.
    const from = this.songIdx;
    const to = 1 - from;
    const next = this.songs[to].el;
    next.playbackRate = this.rate;
    next.play().catch((e) => this.onPlayError(e));
    this.setSongVolume(to, 1, SONG_LOOP.crossfade);
    this.setSongVolume(from, 0, SONG_LOOP.crossfade);
    this.songIdx = to;
    this.fading = true;
    window.setTimeout(() => {
      this.fading = false;
      if (this.songIdx !== to) return;
      const old = this.songs[from];
      if (old) {
        old.el.pause();
        old.el.currentTime = SONG_LOOP.start; // ready for the next hand-over
      }
    }, (SONG_LOOP.crossfade + 0.08) * 1000);
  }

  private pauseSongs(): void {
    for (const s of this.songs) s.el.pause();
  }

  private resumeSongs(): void {
    const cur = this.songs[this.songIdx];
    if (cur) cur.el.play().catch((e) => this.onPlayError(e));
  }

  private stopSongs(): void {
    if (this.songTimer !== null) window.clearInterval(this.songTimer);
    this.songTimer = null;
    this.fading = false;
    this.pauseSongs();
  }

  /** For automated tests: current song position (seconds) and which copy is playing. */
  get songState(): { time: number; copy: number; playing: boolean } | null {
    const cur = this.songs[this.songIdx];
    return cur ? { time: cur.el.currentTime, copy: this.songIdx, playing: !cur.el.paused } : null;
  }

  // ------------------------------------------------------------ sequencer

  private startSequencer(): void {
    if (!this.ctx || this.timer !== null) return;
    this.nextStepTime = this.ctx.currentTime + 0.06;
    this.timer = window.setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  private stopSequencer(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    while (this.nextStepTime < ctx.currentTime + 0.12) {
      const stepDur = 60 / BPM / 4 / this.rate;
      this.playStep(this.step, this.nextStepTime, stepDur);
      this.nextStepTime += stepDur;
      this.step = (this.step + 1) % LEAD.length;
    }
  }

  private playStep(i: number, t: number, stepDur: number): void {
    const lead = LEAD[i];
    if (lead !== '-' && lead !== '.') {
      this.tone(midiToFreq(noteToMidi(lead)), t, noteLength(LEAD, i) * stepDur * 0.9, 0.16, 'pulse');
    }
    const bass = BASS[i];
    if (bass !== '-' && bass !== '.') {
      this.tone(midiToFreq(noteToMidi(bass)), t, noteLength(BASS, i) * stepDur * 0.8, 0.3, 'triangle');
    }
    const dr = DRUMS[i];
    if (dr === 'k') this.kick(t);
    else if (dr === 's') this.noiseHit(t, 0.12, 1800, 'bandpass', 0.35);
    else if (dr === 'h') this.noiseHit(t, 0.03, 7000, 'highpass', 0.12);
  }

  private tone(freq: number, t: number, dur: number, vol: number, type: 'pulse' | OscillatorType, dest?: AudioNode): OscillatorNode | null {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return null;
    const osc = ctx.createOscillator();
    if (type === 'pulse' && this.pulse) osc.setPeriodicWave(this.pulse);
    else osc.type = type === 'pulse' ? 'square' : type;
    osc.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.setValueAtTime(vol * 0.7, t + Math.max(0.01, dur - 0.03));
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(g).connect(dest ?? this.musicBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    return osc;
  }

  private kick(t: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(g).connect(this.musicBus);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  private noiseHit(t: number, dur: number, freq: number, type: BiquadFilterType, vol: number, dest?: AudioNode): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise || !this.musicBus) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(dest ?? this.musicBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.01);
  }

  // ------------------------------------------------------------ sound effects

  sfxLane(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const osc = this.tone(520, t, 0.07, 0.18, 'pulse', this.master);
    osc?.frequency.exponentialRampToValueAtTime(900, t + 0.06);
  }

  sfxCrash(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    this.noiseHit(t, 0.6, 2400, 'lowpass', 0.9, this.master);
    const osc = this.tone(330, t, 0.45, 0.25, 'square', this.master);
    osc?.frequency.exponentialRampToValueAtTime(45, t + 0.45);
  }
}

function makePulseWave(ctx: AudioContext, duty: number): PeriodicWave {
  const n = 32;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) {
    real[k] = Math.sin(2 * Math.PI * k * duty) / (k * Math.PI);
    imag[k] = (1 - Math.cos(2 * Math.PI * k * duty)) / (k * Math.PI);
  }
  return ctx.createPeriodicWave(real, imag);
}

function makeNoise(ctx: AudioContext): AudioBuffer {
  const len = ctx.sampleRate;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}
