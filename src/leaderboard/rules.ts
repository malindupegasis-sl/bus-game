/**
 * Leaderboard rules shared by the game and the database. supabase/leaderboard.sql repeats these
 * numbers and word lists; tests/leaderboard.test.ts checks the two stay the same.
 */

export const NAME_MIN = 3;
export const NAME_MAX = 12;
/**
 * A score is impossible if it's above SCORE_SLACK + MAX_POINTS_PER_SECOND × run seconds. Even a
 * permanent boost knocking off a vehicle every 0.45 s (impossible in play) scores < 200/s.
 */
export const MAX_POINTS_PER_SECOND = 250;
export const SCORE_SLACK = 500;
export const MAX_RUN_SECONDS = 7200;
export const TOP_N = 10;

/**
 * Basic rude-word filter. Names are lower-cased, common look-alike digits/symbols are mapped to
 * letters, and then:
 *  - RUDE_PARTS must not appear anywhere in the name with spaces removed;
 *  - RUDE_WORDS (short words that hide inside ordinary names, like "ass" in "Hassan" or "shit" in
 *    "Prashitha") must not be a whole word.
 * English plus the usual Sinhala (romanised) insults. Basic on purpose: it stops casual abuse,
 * not a determined troll.
 */
export const RUDE_PARTS = [
  'fuck', 'shithead', 'bullshit', 'cunt', 'bitch', 'nigger', 'nigga', 'faggot', 'whore', 'slut', 'penis',
  'vagina', 'pussy', 'wank', 'twat', 'bastard', 'asshole', 'dildo', 'hitler', 'retard',
  'hutta', 'huththa', 'hutto', 'huththo', 'ponnaya', 'pakaya', 'pukaya', 'kimbi',
  'wesige', 'besige', 'paiya',
] as const;
export const RUDE_WORDS = ['shit', 'ass', 'arse', 'sex', 'cock', 'dick', 'tits', 'fag', 'rape', 'nazi', 'cum', 'wesi', 'wesa', 'paka', 'puka', 'kari'] as const;
/** Look-alikes mapped before checking (so "SH1T" and "B!TCH" are caught). */
export const LEET_FROM = '0134578@$!|';
export const LEET_TO = 'oieastbasii';
