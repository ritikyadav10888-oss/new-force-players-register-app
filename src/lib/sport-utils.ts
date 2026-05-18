import { formatCricketExportStyleSummary, parseCricketRoles, toggleCricketRoleString } from '@/lib/cricket-roles';
import { formatFootballRolesExport, parseFootballRoles, toggleFootballRoleString } from '@/lib/football-roles';

export function normalizeSportKey(sport: string | null | undefined): string {
  return String(sport ?? '').trim().toLowerCase();
}

/** Default missing sport to cricket (legacy tournaments). */
export function isCricketSport(t: { sport?: string | null } | null | undefined): boolean {
  if (t?.sport == null || String(t.sport).trim() === '') return true;
  return normalizeSportKey(t.sport) === 'cricket';
}

export function isFootballSport(t: { sport?: string | null } | null | undefined): boolean {
  return normalizeSportKey(t?.sport) === 'football';
}

/** Cricket or football: structured chip roles on the registration form (not generic dropdown). */
export function usesStructuredSportsProfile(t: { sport?: string | null } | null | undefined): boolean {
  return isCricketSport(t) || isFootballSport(t);
}

export function parseSportRoles(
  sport: string | null | undefined,
  role: string | null | undefined
): string[] {
  if (isFootballSport({ sport })) return parseFootballRoles(role);
  return parseCricketRoles(role);
}

export function toggleSportRoleString(
  sport: string | null | undefined,
  current: string | null | undefined,
  toggled: string
): string {
  if (isFootballSport({ sport })) return toggleFootballRoleString(current, toggled);
  return toggleCricketRoleString(current, toggled);
}

/** CSV / admin: one “style” cell — cricket uses hand/bowling rules; football lists positions. */
export function formatSportExportStyleSummary(
  sport: string | null | undefined,
  player: {
    role?: string | null;
    battingHand?: string | null;
    bowlingType?: string | null;
    allRounderType?: string | null;
  }
): string {
  if (isFootballSport({ sport })) return formatFootballRolesExport(player.role);
  return formatCricketExportStyleSummary(player);
}
