/**
 * Multi-sport tournament config: selectable sport entries with custom fees
 * and entry types (individual / doubles / team). Legacy tournaments keep a
 * single sport+fee+type when sports_config is empty.
 */

export type SportEntryType = 'individual' | 'doubles' | 'team';

export type SportEntry = {
  id: string;
  name: string;
  entryType: SportEntryType;
  fee: number;
  minPlayers: number;
  maxPlayers: number;
  /** Groups formats e.g. Badminton Singles/Doubles under "Badminton". */
  sportFamily?: string;
  formatLabel?: string;
  presetKey?: string;
  /** Admin-created team slots for this team sport only. */
  teams?: PrecreatedTeam[];
};

export type PrecreatedTeam = {
  id: string;
  name: string;
};

export type FeeBreakdownItem = {
  sportId: string;
  name: string;
  fee: number;
};

export function newSportEntryId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `sp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function newTeamSlotId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `tm_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function parseSportsConfig(raw: unknown): SportEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: SportEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id.trim() : '';
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    if (!id || !name) continue;
    const entryType = normalizeEntryType(o.entryType ?? o.entry_type);
    const fee = Math.max(0, Math.round(Number(o.fee) || 0));
    let minPlayers = Math.max(1, Math.round(Number(o.minPlayers ?? o.min_players) || 1));
    let maxPlayers = Math.max(minPlayers, Math.round(Number(o.maxPlayers ?? o.max_players) || minPlayers));
    if (entryType === 'individual') {
      minPlayers = 1;
      maxPlayers = 1;
    } else if (entryType === 'doubles') {
      minPlayers = 2;
      maxPlayers = 2;
    }
    out.push({
      id,
      name,
      entryType,
      fee,
      minPlayers,
      maxPlayers,
      sportFamily:
        typeof o.sportFamily === 'string'
          ? o.sportFamily.trim()
          : typeof o.sport_family === 'string'
            ? o.sport_family.trim()
            : undefined,
      formatLabel:
        typeof o.formatLabel === 'string'
          ? o.formatLabel.trim()
          : typeof o.format_label === 'string'
            ? o.format_label.trim()
            : undefined,
      presetKey:
        typeof o.presetKey === 'string'
          ? o.presetKey.trim()
          : typeof o.preset_key === 'string'
            ? o.preset_key.trim()
            : undefined,
      teams: entryType === 'team' ? parsePrecreatedTeams(o.teams) : undefined,
    });
  }
  return out;
}

export function parsePrecreatedTeams(raw: unknown): PrecreatedTeam[] {
  if (!Array.isArray(raw)) return [];
  const out: PrecreatedTeam[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id.trim() : '';
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    if (!id || !name) continue;
    out.push({ id, name });
  }
  return out;
}

function normalizeEntryType(v: unknown): SportEntryType {
  const s = String(v || '')
    .trim()
    .toLowerCase();
  if (s === 'doubles' || s === 'double' || s === 'pair') return 'doubles';
  if (s === 'team') return 'team';
  return 'individual';
}

export function isMultiSportMode(sportsConfig: SportEntry[]): boolean {
  return sportsConfig.length > 0;
}

/** Tournament type Individual/Solo → no team name / representative. */
export function isSoloTournamentType(type: unknown): boolean {
  const t = String(type || '').trim().toLowerCase();
  return t === 'individual' || t === 'solo';
}

/**
 * Solo/Individual tournament roster from selected sports:
 * - Singles only → 1 player
 * - Any doubles → 2 players (player + partner), still no team rep / capacity
 * - Team sports are ignored for roster size (solo tournaments don't use team identity)
 */
export function soloTournamentRosterBounds(selected: SportEntry[]): {
  minPlayers: number;
  maxPlayers: number;
  needsTeamSlot: boolean;
  hasTeamSport: boolean;
  hasDoubles: boolean;
  individualOnly: boolean;
} {
  const hasDoubles = selected.some((s) => s.entryType === 'doubles');
  if (hasDoubles) {
    return {
      minPlayers: 2,
      maxPlayers: 2,
      needsTeamSlot: false,
      hasTeamSport: false,
      hasDoubles: true,
      individualOnly: false,
    };
  }
  return {
    minPlayers: 1,
    maxPlayers: 1,
    needsTeamSlot: false,
    hasTeamSport: false,
    hasDoubles: false,
    individualOnly: true,
  };
}

/** @deprecated Use soloTournamentRosterBounds(selected) */
export function soloForcedRosterBounds(): ReturnType<typeof soloTournamentRosterBounds> {
  return soloTournamentRosterBounds([]);
}

export function resolveSelectedSports(
  sportsConfig: SportEntry[],
  selectedIds: unknown
): SportEntry[] {
  if (!Array.isArray(selectedIds) || selectedIds.length === 0) return [];
  const idSet = new Set(
    selectedIds.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
  );
  return sportsConfig.filter((s) => idSet.has(s.id));
}

export function sumSportFees(entries: SportEntry[]): number {
  return entries.reduce((sum, s) => sum + (Number(s.fee) || 0), 0);
}

export function buildFeeBreakdown(entries: SportEntry[]): FeeBreakdownItem[] {
  return entries.map((s) => ({ sportId: s.id, name: s.name, fee: s.fee }));
}

/** Roster bounds from selected sports (highest min / highest max among team/doubles). */
export function rosterBoundsForSelection(selected: SportEntry[]): {
  minPlayers: number;
  maxPlayers: number;
  needsTeamSlot: boolean;
  hasTeamSport: boolean;
  hasDoubles: boolean;
  individualOnly: boolean;
} {
  if (selected.length === 0) {
    return {
      minPlayers: 1,
      maxPlayers: 1,
      needsTeamSlot: false,
      hasTeamSport: false,
      hasDoubles: false,
      individualOnly: true,
    };
  }
  const hasTeamSport = selected.some((s) => s.entryType === 'team');
  const hasDoubles = selected.some((s) => s.entryType === 'doubles');
  const individualOnly = selected.every((s) => s.entryType === 'individual');

  let minPlayers = 1;
  let maxPlayers = 1;
  for (const s of selected) {
    minPlayers = Math.max(minPlayers, s.minPlayers);
    maxPlayers = Math.max(maxPlayers, s.maxPlayers);
  }

  return {
    minPlayers,
    maxPlayers,
    needsTeamSlot: hasTeamSport,
    hasTeamSport,
    hasDoubles,
    individualOnly,
  };
}

/**
 * Effective registration fee for a tournament given optional selected sport ids.
 * Legacy (no sports_config): tournament.fee.
 * Multi-sport: sum of selected entries' fees.
 */
export function resolveRegistrationFee(params: {
  legacyFee: number;
  sportsConfig: SportEntry[];
  selectedSportIds?: unknown;
}): { fee: number; selected: SportEntry[]; breakdown: FeeBreakdownItem[]; multi: boolean } {
  const multi = isMultiSportMode(params.sportsConfig);
  if (!multi) {
    const fee = Math.max(0, Math.round(Number(params.legacyFee) || 0));
    return { fee, selected: [], breakdown: [], multi: false };
  }
  const selected = resolveSelectedSports(params.sportsConfig, params.selectedSportIds);
  const fee = sumSportFees(selected);
  return { fee, selected, breakdown: buildFeeBreakdown(selected), multi: true };
}

export function entryTypeLabel(t: SportEntryType): string {
  if (t === 'team') return 'Team';
  if (t === 'doubles') return 'Doubles';
  return 'Singles';
}

/** Selected team-sport entries only. */
export function teamSportsFromSelection(selected: SportEntry[]): SportEntry[] {
  return selected.filter((s) => s.entryType === 'team');
}

/** Parse { [sportId]: teamIdOrName } maps from client/DB. */
export function parseTeamsBySport(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [sportId, teamId] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof sportId !== 'string' || !sportId.trim()) continue;
    if (typeof teamId !== 'string' || !teamId.trim()) continue;
    out[sportId.trim()] = teamId.trim();
  }
  return out;
}

/** Normalize team name for capacity matching (case/spacing insensitive). */
export function normalizeTeamKey(name: string): string {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Trim names and nest cleaned teams on each team sport; drop empty sports. */
export function cleanSportsConfigForSave(sports: SportEntry[]): SportEntry[] {
  const out: SportEntry[] = [];
  for (const s of sports) {
    const name = s.name.trim();
    if (!name) continue;
    const formatLabel =
      typeof s.formatLabel === 'string' && s.formatLabel.trim() && s.formatLabel.trim() !== '__custom__'
        ? s.formatLabel.trim()
        : undefined;
    if (s.entryType !== 'team') {
      const { teams: _drop, ...rest } = s;
      out.push({ ...rest, name, formatLabel });
      continue;
    }
    const teams = (s.teams || [])
      .map((t) => ({ id: t.id, name: t.name.trim() }))
      .filter((t) => t.id && t.name);
    // Player-entered names are the default; keep optional admin suggestions if present.
    out.push(
      teams.length > 0
        ? { ...s, name, formatLabel, teams }
        : { ...s, name, formatLabel, teams: undefined }
    );
  }
  return out;
}

/** Teams available for a team-sport entry (per-sport list, else legacy global). */
export function teamsForSport(
  sport: SportEntry,
  legacyGlobalTeams: PrecreatedTeam[] = []
): PrecreatedTeam[] {
  if (sport.entryType !== 'team') return [];
  if (Array.isArray(sport.teams) && sport.teams.length > 0) return sport.teams;
  return legacyGlobalTeams;
}

/** Flatten all per-sport teams (for admin list / occupancy labels). */
export function flattenTeamsFromSports(
  sports: SportEntry[],
  legacyGlobalTeams: PrecreatedTeam[] = []
): PrecreatedTeam[] {
  const byId = new Map<string, PrecreatedTeam>();
  for (const s of sports) {
    for (const t of teamsForSport(s, [])) {
      byId.set(t.id, t);
    }
  }
  if (byId.size === 0) {
    for (const t of legacyGlobalTeams) byId.set(t.id, t);
  }
  return [...byId.values()];
}

/**
 * Attach legacy global teams onto team sports that have no nested teams yet.
 */
export function attachLegacyTeamsToSports(
  sports: SportEntry[],
  legacyGlobalTeams: PrecreatedTeam[]
): SportEntry[] {
  if (!legacyGlobalTeams.length) return sports;
  return sports.map((s) => {
    if (s.entryType !== 'team') return s;
    if (s.teams && s.teams.length > 0) return s;
    return { ...s, teams: legacyGlobalTeams.map((t) => ({ ...t })) };
  });
}

/**
 * Resolve team names per selected team sport.
 * Default: one shared team name for all team sports (player types once).
 * Pass `teamsBySport` only for legacy per-sport maps; if empty, uses `sharedTeamName`.
 */
export function resolveTeamsBySport(params: {
  selected: SportEntry[];
  teamsBySport?: unknown;
  sharedTeamName?: string;
  precreatedTeams?: PrecreatedTeam[];
}):
  | { ok: true; teamsBySport: Record<string, string>; teamNames: string[]; primaryTeamName: string | null }
  | { ok: false; error: string } {
  const teamSports = teamSportsFromSelection(params.selected);
  if (teamSports.length === 0) {
    return { ok: true, teamsBySport: {}, teamNames: [], primaryTeamName: null };
  }

  const map = parseTeamsBySport(params.teamsBySport);
  const shared = (params.sharedTeamName || '').trim().replace(/\s+/g, ' ');
  const legacy = params.precreatedTeams || [];
  const resolved: Record<string, string> = {};
  const names: string[] = [];

  for (const sport of teamSports) {
    let raw = (map[sport.id] || '').trim();
    if (!raw && shared) raw = shared;
    if (!raw) {
      return {
        ok: false,
        error:
          teamSports.length > 1
            ? `Enter your team name (applies to ${teamSports.map((s) => s.name).join(', ')}).`
            : `Enter a team name for ${sport.name}.`,
      };
    }

    const available = teamsForSport(sport, legacy);
    const byId = available.find((t) => t.id === raw);
    const displayName = byId ? byId.name : raw.replace(/\s+/g, ' ').trim();
    if (!displayName) {
      return { ok: false, error: `Enter a team name for ${sport.name}.` };
    }

    resolved[sport.id] = displayName;
    if (!names.includes(displayName)) names.push(displayName);
  }

  return {
    ok: true,
    teamsBySport: resolved,
    teamNames: names,
    primaryTeamName: names[0] || null,
  };
}

export type TeamOccupancyMap = Record<string, Record<string, number>>;

/**
 * Count paid (or submitted) players already on each team for each team-sport.
 * Keyed: occupancy[sportId][normalizedTeamKey] = player count.
 */
export function buildTeamOccupancyFromRegs(
  regs: Array<{
    payment_status?: string | null;
    teams_by_sport?: unknown;
    players?: unknown;
  }>
): TeamOccupancyMap {
  const out: TeamOccupancyMap = {};
  for (const reg of regs) {
    const status = String(reg.payment_status || '').toLowerCase();
    // Count Paid registrations; also treat empty as paid-or-committed for free events.
    if (status && status !== 'paid' && status !== 'completed') continue;
    const map = parseTeamsBySport(reg.teams_by_sport);
    const playerCount = Array.isArray(reg.players) ? reg.players.length : 0;
    if (playerCount <= 0) continue;
    for (const [sportId, teamRef] of Object.entries(map)) {
      const key = normalizeTeamKey(teamRef);
      if (!key) continue;
      if (!out[sportId]) out[sportId] = {};
      out[sportId][key] = (out[sportId][key] || 0) + playerCount;
    }
  }
  return out;
}

/** How many seats are left on a team for a sport entry (by team name or legacy id). */
export function seatsRemaining(
  sport: SportEntry,
  teamRef: string,
  occupancy: TeamOccupancyMap
): number {
  if (sport.entryType !== 'team') return Infinity;
  const key = normalizeTeamKey(teamRef);
  const used = occupancy[sport.id]?.[key] || 0;
  return Math.max(0, sport.maxPlayers - used);
}

/** Players already counted on this team name for the sport. */
export function seatsUsed(
  sport: SportEntry,
  teamRef: string,
  occupancy: TeamOccupancyMap
): number {
  if (sport.entryType !== 'team') return 0;
  const key = normalizeTeamKey(teamRef);
  return occupancy[sport.id]?.[key] || 0;
}

