import { LEET_FROM, LEET_TO, NAME_MAX, NAME_MIN, RUDE_PARTS, RUDE_WORDS } from './rules';

/** Trim and collapse runs of spaces (the database does the same). */
export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

function deLeet(s: string): string {
  let out = '';
  for (const ch of s.toLowerCase()) {
    const i = LEET_FROM.indexOf(ch);
    out += i >= 0 ? LEET_TO[i] : ch;
  }
  return out;
}

export function isRude(name: string): boolean {
  const s = deLeet(name);
  const squashed = s.replace(/[^a-z]/g, '');
  if (RUDE_PARTS.some((w) => squashed.includes(w))) return true;
  const words = s.split(/[^a-z]+/).filter(Boolean);
  return words.some((w) => (RUDE_WORDS as readonly string[]).includes(w));
}

export type NameProblem = 'short' | 'long' | 'chars' | 'rude';

/** Why a nickname can't be used, or null if it's fine (check the normalized name). */
export function nameProblem(raw: string): NameProblem | null {
  const n = normalizeName(raw);
  if (n.length < NAME_MIN) return 'short';
  if (n.length > NAME_MAX) return 'long';
  if (!/^[A-Za-z0-9 ]+$/.test(n)) return 'chars';
  if (isRude(n)) return 'rude';
  return null;
}

export const NAME_MESSAGES: Record<NameProblem, string> = {
  short: `At least ${NAME_MIN} characters, please.`,
  long: `${NAME_MAX} characters at most.`,
  chars: 'Letters, numbers and spaces only.',
  rude: "Let's keep it friendly. Pick another name.",
};

const KEY = 'busgame.nickname';

export function loadName(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    return v && !nameProblem(v) ? normalizeName(v) : null;
  } catch {
    return null;
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(KEY, normalizeName(name));
  } catch {
    /* kept for this visit only */
  }
}
