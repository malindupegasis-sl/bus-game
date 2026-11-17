import { GAME_TITLE, SHARE_URL } from './config';
import { formatScore } from './game/score';

export function shareText(score: number, url = SHARE_URL): string {
  return `I scored ${formatScore(score)} in ${GAME_TITLE}! Beat me: ${url}`;
}

export function whatsappUrl(score: number, url = SHARE_URL): string {
  return `https://wa.me/?text=${encodeURIComponent(shareText(score, url))}`;
}
