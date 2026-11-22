import { GAME_TITLE, SHARE_URL } from './config';
import { formatScore } from './game/score';

/** With a leaderboard rank: "I'm #3 on ... with 2,140 points! Beat me: ..."; without: just the score. */
export function shareText(score: number, url = SHARE_URL, rank: number | null = null): string {
  if (rank !== null && rank >= 1) return `I'm #${rank} on ${GAME_TITLE} with ${formatScore(score)} points! Beat me: ${url}`;
  return `I scored ${formatScore(score)} in ${GAME_TITLE}! Beat me: ${url}`;
}

/** "Played 1,234 times" (start screen). */
export function playsLabel(n: number): string {
  return n === 1 ? 'Played 1 time' : `Played ${formatScore(n)} times`;
}

export function whatsappUrl(score: number, url = SHARE_URL, rank: number | null = null): string {
  return `https://wa.me/?text=${encodeURIComponent(shareText(score, url, rank))}`;
}
