export const CRICKET_ROLES = ['Batsman', 'Bowler', 'All-rounder', 'Wicketkeeper'] as const;
export type CricketRole = (typeof CRICKET_ROLES)[number];

const ROLE_SET = new Set<string>(CRICKET_ROLES);

export function normalizeBattingHandUi(v: string | undefined): string {
  if (!v) return '';
  if (v === 'Right-handed') return 'Right-Hand';
  if (v === 'Left-handed') return 'Left-Hand';
  return v;
}

/** Parse comma-separated playing roles from DB / form (stable order). */
export function parseCricketRoles(role: string | null | undefined): string[] {
  if (!role || !String(role).trim()) return [];
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const part of String(role).split(',')) {
    const p = part.trim();
    if (!p || !ROLE_SET.has(p) || seen.has(p)) continue;
    seen.add(p);
    ordered.push(p);
  }
  return CRICKET_ROLES.filter((r) => seen.has(r));
}

export function toggleCricketRoleString(current: string | null | undefined, toggled: string): string {
  const set = new Set(parseCricketRoles(current));
  if (set.has(toggled)) set.delete(toggled);
  else if (ROLE_SET.has(toggled)) set.add(toggled);
  return CRICKET_ROLES.filter((r) => set.has(r)).join(', ');
}

export function cricketRolesNeedBattingHand(roles: string[]): boolean {
  return roles.some((r) => r === 'Batsman' || r === 'Wicketkeeper' || r === 'All-rounder');
}

export function cricketRolesNeedBowling(roles: string[]): boolean {
  return roles.some((r) => r === 'Bowler' || r === 'All-rounder');
}

/** Both batting-hand and bowling-style fields apply (e.g. All-rounder or Batsman + Bowler). */
export function cricketRolesNeedCombinedDetail(roleStr: string | null | undefined): boolean {
  const roles = parseCricketRoles(roleStr);
  return cricketRolesNeedBattingHand(roles) && cricketRolesNeedBowling(roles);
}

export function buildCricketCombinedType(
  battingHand: string | undefined,
  bowlingType: string | undefined
): string | null {
  const line = [normalizeBattingHandUi(battingHand), bowlingType?.trim()].filter(Boolean).join(' | ');
  return line || null;
}

export function allRounderTypeForCricketPayload(
  isCricket: boolean,
  roleStr: string | undefined,
  battingHand: string | undefined,
  bowlingType: string | undefined,
  legacyAllRounderType: string | undefined
): string | null | undefined {
  if (!isCricket) return legacyAllRounderType;
  if (cricketRolesNeedCombinedDetail(roleStr)) {
    return buildCricketCombinedType(battingHand, bowlingType);
  }
  return legacyAllRounderType;
}

/** CSV / admin: one cell for hand + bowling when relevant. */
export function formatCricketExportStyleSummary(player: {
  role?: string | null;
  battingHand?: string | null;
  bowlingType?: string | null;
  allRounderType?: string | null;
}): string {
  const roles = parseCricketRoles(player.role || '');
  const needBat = cricketRolesNeedBattingHand(roles);
  const needBowl = cricketRolesNeedBowling(roles);
  const hand = normalizeBattingHandUi(player.battingHand || undefined);
  const bowl = (player.bowlingType || '').trim();
  if (needBat && needBowl) {
    const combined = [hand, bowl].filter(Boolean).join(' · ');
    return combined || (player.allRounderType ? String(player.allRounderType) : '-') || '-';
  }
  if (needBat && hand) return hand;
  if (needBowl && bowl) return bowl;
  if (player.allRounderType) return String(player.allRounderType);
  return '-';
}
