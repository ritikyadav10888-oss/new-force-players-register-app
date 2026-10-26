import type { AgeCategoryDef } from '@/lib/age-categories';

/** Team-only registration: team info + category, no player details (Lokhandwala Premier League S10). */
export const TEAM_INFO_ONLY_TOURNAMENT_IDS = new Set(['b92ac634-349c-49da-bae3-a15163613b0d']);

/** Team-only tournaments: a player's category is their team's, whatever their age. */
export function teamPlayerAgeCategories(tournamentId: string | undefined, cats: AgeCategoryDef[]) {
  if (!TEAM_INFO_ONLY_TOURNAMENT_IDS.has(tournamentId || '')) return cats;
  return cats.map((c) => ({ ...c, minAge: null, maxAge: null, minDob: null, maxDob: null }));
}
