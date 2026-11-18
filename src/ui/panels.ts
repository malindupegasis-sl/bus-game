import { formatScore } from '../game/score';
import type { Board } from '../leaderboard/api';
import { NAME_MESSAGES, nameProblem, normalizeName } from '../leaderboard/nickname';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

/**
 * Nickname entry. Shown before the very first run (no cancel) and from the start screen's
 * "change name" button (with cancel).
 */
export class NamePanel {
  private form = $<HTMLFormElement>('#name-panel');
  private input = $<HTMLInputElement>('#name-input');
  private error = $<HTMLParagraphElement>('#name-error');
  private cancel = $<HTMLButtonElement>('#name-cancel');
  private onDone: ((name: string | null) => void) | null = null;

  constructor() {
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const problem = nameProblem(this.input.value);
      if (problem) {
        this.error.textContent = NAME_MESSAGES[problem];
        this.input.focus();
        return;
      }
      this.close(normalizeName(this.input.value));
    });
    this.cancel.addEventListener('click', () => this.close(null));
    // Only letters, numbers and spaces can be typed in the first place.
    this.input.addEventListener('input', () => {
      const clean = this.input.value.replace(/[^A-Za-z0-9 ]/g, '').replace(/ {2,}/g, ' ').slice(0, 12);
      if (clean !== this.input.value) this.input.value = clean;
      this.error.textContent = '';
    });
  }

  get isOpen(): boolean {
    return !this.form.hidden;
  }

  open(current: string | null, canCancel: boolean, onDone: (name: string | null) => void): void {
    this.onDone = onDone;
    this.input.value = current ?? '';
    this.error.textContent = '';
    this.cancel.hidden = !canCancel;
    this.form.hidden = false;
    // Focus brings up the keyboard on desktop; on phones it needs the player's tap anyway.
    try {
      this.input.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
  }

  private close(name: string | null): void {
    this.form.hidden = true;
    this.input.blur();
    const cb = this.onDone;
    this.onDone = null;
    cb?.(name);
  }
}

export type BoardState = { kind: 'loading' } | { kind: 'unavailable' } | { kind: 'loaded'; board: Board };

const REJECT_NOTES: Record<string, string> = {
  rate_limited: 'THIS RUN WASN’T SAVED: TOO MANY RUNS TOO FAST',
  impossible_score: 'THIS RUN WASN’T SAVED',
  bad_run: 'THIS RUN WASN’T SAVED',
};

/** The game-over screen: score, top 10 (own entry highlighted), own position, RETRY / SHARE. */
export class OverPanel {
  private el = $<HTMLElement>('#over');
  private score = $<HTMLElement>('#over-score');
  private best = $<HTMLElement>('#over-best');
  private newBest = $<HTMLElement>('#over-newbest');
  private list = $<HTMLOListElement>('#board');
  private me = $<HTMLParagraphElement>('#board-me');
  private status = $<HTMLParagraphElement>('#board-status');

  show(score: number, best: number, isNewBest: boolean): void {
    this.score.textContent = formatScore(score);
    this.best.textContent = `BEST: ${formatScore(best)}`;
    this.newBest.hidden = !isNewBest;
    this.el.hidden = false;
  }

  hide(): void {
    this.el.hidden = true;
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  setBoard(state: BoardState, myName: string): void {
    this.list.replaceChildren();
    this.me.hidden = true;
    if (state.kind === 'loading') {
      this.status.textContent = 'LOADING LEADERBOARD…';
      return;
    }
    if (state.kind === 'unavailable') {
      this.status.textContent = 'LEADERBOARD UNAVAILABLE';
      return;
    }
    const { top, me, rejected } = state.board;
    const key = myName.toLowerCase();
    let shown = false;
    for (const r of top) {
      const li = document.createElement('li');
      const mine = r.nickname.toLowerCase() === key;
      if (mine) {
        li.className = 'me';
        shown = true;
      }
      // Nicknames are other players' text: only ever set as textContent.
      for (const [cls, text] of [['r', `${r.rank}.`], ['n', r.nickname], ['s', formatScore(r.score)]] as const) {
        const span = document.createElement('span');
        span.className = cls;
        span.textContent = text;
        li.appendChild(span);
      }
      this.list.appendChild(li);
    }
    if (!top.length) this.status.textContent = 'NO SCORES YET';
    else this.status.textContent = rejected ? (REJECT_NOTES[rejected] ?? '') : '';
    if (!shown && me && me.rank !== null) {
      this.me.textContent = `YOU: #${me.rank} OF ${me.total}`;
      this.me.hidden = false;
    }
  }
}
