import { MAX_MUSIC_RATE, SONG_LOOP } from '../config';
import { BASS, BPM, DRUMS, LEAD, midiToFreq, noteLength, noteToMidi } from './music';
import { musicAction, STUCK_PLAY_AFTER } from './musicHealth';

const MUTE_KEY = 'busgame.muted';
const SONG_URL = `${import.meta.env.BASE_URL}audio/song.mp3`;
/** How often the watchdog checks the music (ms). */
const WATCH_EVERY = 250;
/**
 * Each playbackRate change makes the pitch-preserving stretcher re-tune, which can be heard as a
 * tiny stutter on iOS. So only change it when the difference is big enough to notice, and not
 * too often: ~6 changes over the whole 1.00 -> 1.25 ramp.
 */
const RATE_STEP = 0.04;
const RATE_MIN_INTERVAL = 4000; // ms
/** Chipmunk mode during the Dham Rajina Xpress boost: faster and higher (pitch NOT preserved). */
export const CHIPMUNK_RATE = 1.35;

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * All game audio. Nothing makes a sound until `unlock()` runs inside a user gesture
 * (mobile browsers require this).
 *
 * Music: public/audio/song.mp3 streams through ONE plain <audio> element (no Web Audio routing,
 * nothing decoded into memory). It loops between SONG_LOOP points by seeking, speeds up with the
 * game (capped at 1.25x, pitch preserved), and a watchdog restarts it if iOS pauses or stalls it.
 * If the file is missing or fails, a Web Audio chiptune plays instead. Sound effects use Web Audio.
 */
export class AudioManager {
  muted = loadMuted();
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private pulse: PeriodicWave | null = null;
  private noise: AudioBuffer | null = null;

  private songAvailable = false;
  private song: HTMLAudioElement | null = null;
  private usingSong = false;
  /** play() was refused for lack of a user gesture; retry on the next one. */
  private pendingResume = false;
  /** True while the game itself has paused the music (page hidden / paused / stopped). */
  private heldByGame = true;

  private wantMusic = false;
  private playing = false;
  private rate = 1;
  private chipmunk = false;

  /** The rate the music actually plays at right now. */
  private get effRate(): number {
    return this.chipmunk ? CHIPMUNK_RATE : this.rate;
  }

  /** Boost on/off: chipmunk mode (1.35x, pitch goes up), then back to normal. */
  setBoost(on: boolean): void {
    if (this.chipmunk === on) return;
    this.chipmunk = on;
    const el = this.song;
    if (el) {
      el.preservesPitch = !on;
      (el as unknown as { webkitPreservesPitch: boolean }).webkitPreservesPitch = !on;
      el.playbackRate = this.effRate;
    }
    this.note(on ? 'chipmunk mode on' : 'chipmunk mode off');
  }
  private step = 0;
  private nextStepTime = 0;
  private timer: number | null = null;

  // Watchdog + debug info
  private lastWatch = 0;
  private lastSongTime = 0;
  private stuckFor = 0;
  restarts = 0;
  lastEvent = 'none';

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

  private note(e: string): void {
    this.lastEvent = e;
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
        ctx.onstatechange = () => this.note(`audio context ${ctx.state}`);
        // A silent blip finishes the unlock on older iOS.
        const src = ctx.createBufferSource();
        src.buffer = ctx.createBuffer(1, 1, 22050);
        src.connect(ctx.destination);
        src.start(0);
      }
      if (this.ctx.state !== 'running' && document.visibilityState === 'visible') void this.ctx.resume();
      if (this.songAvailable && !this.song) this.createSong();
      if (this.pendingResume && this.playing && this.usingSong && !this.heldByGame) {
        this.pendingResume = false;
        this.playSong();
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
    this.chipmunk = false;
    if (this.song) {
      this.song.preservesPitch = true;
      (this.song as unknown as { webkitPreservesPitch: boolean }).webkitPreservesPitch = true;
    }
    this.lastRateChange = -Infinity;
    if (this.ctx) this.beginMusic();
  }

  private beginMusic(): void {
    if (!this.ctx) return;
    this.playing = true;
    this.heldByGame = false;
    if (this.song) {
      this.usingSong = true;
      this.song.playbackRate = this.effRate;
      this.song.currentTime = SONG_LOOP.start;
      this.playSong();
    } else {
      this.usingSong = false;
      this.startSequencer();
    }
  }

  stopMusic(): void {
    this.wantMusic = false;
    this.playing = false;
    this.heldByGame = true;
    this.stopSequencer();
    this.song?.pause();
  }

  /** Page hidden / game paused. */
  suspend(): void {
    this.heldByGame = true;
    this.stopSequencer();
    this.song?.pause();
    void this.ctx?.suspend();
  }

  resumeAll(): void {
    if (!this.ctx) return;
    void this.ctx.resume();
    if (!this.playing) return;
    this.heldByGame = false;
    if (this.usingSong) this.playSong();
    else this.startSequencer();
  }

  private lastRateChange = -Infinity;

  setRate(r: number): void {
    const next = Math.max(0.5, Math.min(MAX_MUSIC_RATE, r));
    const now = performance.now();
    const bigEnough = Math.abs(next - this.rate) >= RATE_STEP || (next === MAX_MUSIC_RATE && this.rate !== next);
    if (bigEnough && now - this.lastRateChange >= RATE_MIN_INTERVAL) {
      this.rate = next;
      this.lastRateChange = now;
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    try {
      localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.master && this.ctx) this.master.gain.setValueAtTime(m ? 0 : 0.55, this.ctx.currentTime);
    if (this.song) this.song.muted = m;
  }

  // ------------------------------------------------------------ song file

  private createSong(): void {
    const el = new Audio(SONG_URL);
    el.preload = 'auto';
    el.loop = false; // looped by hand between SONG_LOOP points (the file has silence at both ends)
    el.preservesPitch = true;
    (el as unknown as { webkitPreservesPitch: boolean }).webkitPreservesPitch = true;
    el.muted = this.muted;
    el.addEventListener('error', () => this.songFailed());
    el.addEventListener('pause', () => {
      if (!this.heldByGame && this.playing && this.usingSong) this.note('song paused by the system');
    });
    el.addEventListener('stalled', () => this.note('song stalled (network)'));
    el.addEventListener('waiting', () => this.note('song buffering'));
    el.addEventListener('ended', () => {
      // Shouldn't happen (we loop before the end), but never let the music just stop.
      el.currentTime = SONG_LOOP.start;
      if (!this.heldByGame && this.playing) this.playSong();
    });
    this.song = el;
  }

  private playSong(): void {
    const el = this.song;
    if (!el) return;
    if (el.playbackRate !== this.effRate) el.playbackRate = this.effRate;
    el.play().then(() => (this.pendingResume = false)).catch((e) => this.onPlayError(e));
  }

  /** Mobile browsers refuse play() until a real gesture: wait for one instead of giving up. */
  private onPlayError(e: unknown): void {
    const name = e instanceof DOMException ? e.name : '';
    if (name === 'NotAllowedError') {
      this.pendingResume = true;
      this.note('song needs a tap to resume');
    } else if (name !== 'AbortError') this.songFailed(); // AbortError = interrupted by pause(), harmless
  }

  /** The file couldn't be loaded or decoded: fall back to the chiptune for good. */
  private songFailed(): void {
    if (!this.song) return;
    this.note('song failed: chiptune instead');
    this.song.pause();
    this.song = null;
    this.songAvailable = false;
    this.usingSong = false;
    if (this.playing && !this.heldByGame) this.startSequencer();
  }

  private loopEnd(el: HTMLAudioElement): number {
    const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : Infinity;
    return Math.min(SONG_LOOP.end, dur - 0.05);
  }

  /**
   * Call every frame. Loops the song at SONG_LOOP.end, applies rate changes, and a few times a
   * second runs the watchdog that recovers from iOS pausing/stalling the song or interrupting
   * the AudioContext.
   */
  tick(nowMs: number): void {
    const el = this.song;
    const active = this.playing && !this.heldByGame && document.visibilityState === 'visible';
    if (el && this.usingSong && active && !el.paused) {
      // One frame of look-ahead so the jump lands before the music's tail.
      if (el.currentTime >= this.loopEnd(el) - 0.02 * this.effRate) el.currentTime = SONG_LOOP.start;
    }
    if (nowMs - this.lastWatch < WATCH_EVERY) return;
    const dt = (nowMs - this.lastWatch) / 1000;
    this.lastWatch = nowMs;
    if (el && el.playbackRate !== this.effRate) el.playbackRate = this.effRate;

    const songTime = el ? el.currentTime : 0;
    const progressing = !!el && !el.paused && Math.abs(songTime - this.lastSongTime) > 0.01;
    this.stuckFor = el && !el.paused && !progressing && active ? this.stuckFor + dt : 0;
    const action = musicAction({
      want: active && !this.pendingResume,
      usingSong: this.usingSong && !!el,
      songPaused: !!el && el.paused,
      songTime,
      lastSongTime: this.lastSongTime,
      stuckFor: this.stuckFor,
      ctxState: this.ctx ? (this.ctx.state as AudioContextState) : 'none',
    });
    this.lastSongTime = songTime;
    if (action === 'resume-ctx' && this.ctx) {
      this.note(`resuming audio context (${this.ctx.state})`);
      this.restarts++;
      void this.ctx.resume();
    } else if (action === 'play' && el) {
      this.note(this.stuckFor >= STUCK_PLAY_AFTER ? 'song stuck: nudging' : 'song was paused: restarting');
      this.restarts++;
      this.playSong();
    } else if (action === 'reload' && el) {
      this.note('song stuck: reloading');
      this.restarts++;
      const t = el.currentTime;
      el.load();
      el.currentTime = t;
      this.stuckFor = 0;
      this.playSong();
    }
  }

  /** Chiptune fallback pitch: up with the chipmunk boost. */
  private get pitch(): number {
    return this.chipmunk ? CHIPMUNK_RATE : 1;
  }

  /** For tests and the debug overlay. */
  get songState(): { time: number; playing: boolean; rate: number; pitchKept: boolean } | null {
    const el = this.song;
    return el ? { time: el.currentTime, playing: !el.paused, rate: el.playbackRate, pitchKept: el.preservesPitch } : null;
  }

  get contextState(): string {
    return this.ctx ? this.ctx.state : 'not started';
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
      const stepDur = 60 / BPM / 4 / this.effRate;
      this.playStep(this.step, this.nextStepTime, stepDur);
      this.nextStepTime += stepDur;
      this.step = (this.step + 1) % LEAD.length;
    }
  }

  private playStep(i: number, t: number, stepDur: number): void {
    const lead = LEAD[i];
    if (lead !== '-' && lead !== '.') {
      this.tone(midiToFreq(noteToMidi(lead)) * this.pitch, t, noteLength(LEAD, i) * stepDur * 0.9, 0.16, 'pulse');
    }
    const bass = BASS[i];
    if (bass !== '-' && bass !== '.') {
      this.tone(midiToFreq(noteToMidi(bass)) * this.pitch, t, noteLength(BASS, i) * stepDur * 0.8, 0.3, 'triangle');
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
