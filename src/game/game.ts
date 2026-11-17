import { loadHighScore, saveHighScore } from './score';
import { World } from './world';

export type Phase = 'title' | 'garage' | 'playing' | 'paused' | 'crashed' | 'over';
export type Dir = -1 | 1;

/** How long the crash animation plays before the game over screen. */
export const CRASH_TIME = 0.9;
/** Ignore Retry for a moment so a panicked tap doesn't skip the game over screen. */
export const RETRY_DELAY = 0.5;

/**
 * Game state machine. Steering comes from the on-screen ▲/▼ buttons, swipes, or keys. A plain tap
 * anywhere else only starts the game or resumes it; it never steers.
 */
export class Game {
  phase: Phase = 'title';
  world: World;
  highScore: number;
  newBest = false;
  /** Seconds since the phase last changed (blinking text, delays). */
  phaseTime = 0;

  constructor(highScore = loadHighScore(), seed?: number) {
    this.highScore = highScore;
    this.world = new World(seed);
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.phaseTime = 0;
  }

  /** Garage (bus customisation): only from the title screen. */
  openGarage(): boolean {
    if (this.phase !== 'title') return false;
    this.setPhase('garage');
    return true;
  }

  closeGarage(): boolean {
    if (this.phase !== 'garage') return false;
    this.setPhase('title');
    return true;
  }

  start(seed?: number): void {
    this.world = new World(seed);
    this.newBest = false;
    this.setPhase('playing');
  }

  /** ▲/▼ button or arrow key. Also starts / resumes, so the buttons work on every screen. */
  press(dir: Dir): 'start' | 'resume' | 'move' | 'none' {
    switch (this.phase) {
      case 'title':
        this.start();
        return 'start';
      case 'paused':
        this.resume();
        return 'resume';
      case 'playing':
        return this.world.move(dir) ? 'move' : 'none';
      default:
        return 'none';
    }
  }

  /** Vertical swipe: steers while playing. */
  swipe(dir: Dir): boolean {
    return this.phase === 'playing' && this.world.move(dir);
  }

  /** Tap on the screen (not a button): start or resume only. */
  tap(): 'start' | 'resume' | 'none' {
    if (this.phase === 'title') return this.start(), 'start';
    if (this.phase === 'paused') return this.resume(), 'resume';
    return 'none';
  }

  /** Enter/Space: start, resume, or retry (in the garage: back to the title). */
  primary(): 'start' | 'resume' | 'retry' | 'none' {
    if (this.phase === 'garage') return this.closeGarage(), 'none';
    if (this.phase === 'title') return this.start(), 'start';
    if (this.phase === 'paused') return this.resume(), 'resume';
    if (this.canRetry()) return this.start(), 'retry';
    return 'none';
  }

  canRetry(): boolean {
    return this.phase === 'over' && this.phaseTime >= RETRY_DELAY;
  }

  retry(): boolean {
    if (!this.canRetry()) return false;
    this.start();
    return true;
  }

  pause(): boolean {
    if (this.phase !== 'playing') return false;
    this.setPhase('paused');
    return true;
  }

  resume(): void {
    if (this.phase === 'paused') this.setPhase('playing');
  }

  update(dt: number): void {
    this.phaseTime += dt;
    if (this.phase === 'playing') {
      this.world.step(dt);
      if (this.world.crashed) {
        const prev = this.highScore;
        this.highScore = saveHighScore(this.world.score);
        this.newBest = this.highScore > prev;
        this.setPhase('crashed');
      }
    } else if (this.phase === 'crashed' && this.phaseTime >= CRASH_TIME) {
      this.setPhase('over');
    }
  }
}
