export type SportsProfileFlags = { enabled: boolean; required: boolean };

/**
 * Playing-role / sport-specific block in `tournaments.form_config`.
 * Historically stored as `cricketProfile`; `sportsProfile` is the preferred alias (same shape).
 */
export function resolveSportsProfile(
  fc: Record<string, unknown> | null | undefined
): SportsProfileFlags {
  if (!fc || typeof fc !== 'object') return { enabled: false, required: false };
  const sp = fc.sportsProfile as { enabled?: boolean; required?: boolean } | undefined;
  const cp = fc.cricketProfile as { enabled?: boolean; required?: boolean } | undefined;
  const enabled = Boolean(sp?.enabled || cp?.enabled);
  const required = Boolean((sp?.required || cp?.required) && enabled);
  return { enabled, required };
}

/** Show role / position UI when admin turned on Show or Required. */
export function isSportsProfileShown(flags: SportsProfileFlags | null | undefined): boolean {
  if (!flags) return false;
  return Boolean(flags.enabled || flags.required);
}

/**
 * Legacy tournaments: sport is Cricket/Football but form_config never had profile keys —
 * default to showing (optional) sports profile on registration.
 */
export function resolveSportsProfileForTournament(
  rawFormConfig: Record<string, unknown>,
  sport: string | null | undefined
): SportsProfileFlags {
  const resolved = resolveSportsProfile(rawFormConfig);
  const hasExplicit =
    Object.prototype.hasOwnProperty.call(rawFormConfig, 'cricketProfile') ||
    Object.prototype.hasOwnProperty.call(rawFormConfig, 'sportsProfile');
  if (hasExplicit) return resolved;
  const key = String(sport ?? 'Cricket').trim().toLowerCase();
  if (key === 'cricket' || key === 'football') {
    return { enabled: true, required: false };
  }
  return resolved;
}

/**
 * On save, mirror `sportsProfile` from the admin UI state (`cricketProfile` field key) so
 * both keys stay aligned for registration and exports.
 */
export function withSyncedSportsProfilePayload<T extends { cricketProfile?: { enabled?: boolean; required?: boolean } }>(
  formConfig: T
): T & { cricketProfile: SportsProfileFlags; sportsProfile: SportsProfileFlags } {
  const cp = formConfig.cricketProfile ?? { enabled: false, required: false };
  const enabled = Boolean(cp.enabled);
  const required = Boolean(cp.required && enabled);
  const profile: SportsProfileFlags = { enabled, required };
  return { ...formConfig, cricketProfile: profile, sportsProfile: { ...profile } };
}
