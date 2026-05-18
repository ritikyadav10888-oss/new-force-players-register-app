export const FOOTBALL_ROLES = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward', 'Winger'] as const;

const ROLE_SET = new Set<string>(FOOTBALL_ROLES);

/** Parse comma-separated football positions from `players.role` (stable order). */
export function parseFootballRoles(role: string | null | undefined): string[] {
  if (!role || !String(role).trim()) return [];
  const seen = new Set<string>();
  for (const part of String(role).split(',')) {
    const p = part.trim();
    if (!p || !ROLE_SET.has(p) || seen.has(p)) continue;
    seen.add(p);
  }
  return FOOTBALL_ROLES.filter((r) => seen.has(r));
}

export function toggleFootballRoleString(current: string | null | undefined, toggled: string): string {
  const set = new Set(parseFootballRoles(current));
  if (set.has(toggled)) set.delete(toggled);
  else if (ROLE_SET.has(toggled)) set.add(toggled);
  return FOOTBALL_ROLES.filter((r) => set.has(r)).join(', ');
}

export function formatFootballRolesExport(role: string | null | undefined): string {
  const roles = parseFootballRoles(role);
  return roles.length ? roles.join(', ') : '-';
}
