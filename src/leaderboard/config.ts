/**
 * Supabase connection for the shared leaderboard. Both values are PUBLIC by design: the anon
 * (publishable) key ships in every copy of the game, and the database only lets it read scores and
 * call submit_score() / leaderboard_top() (see supabase/leaderboard.sql).
 * NEVER put the service_role / secret key here.
 *
 * Leave them empty and the game shows "Leaderboard unavailable" and otherwise works normally.
 */
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';
