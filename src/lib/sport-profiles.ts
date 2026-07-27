/**
 * Per-sport player profiles for Cricket + Football (from selected multi-sport entries).
 * Other sports have no structured profile for now.
 */

import {
  cricketRolesNeedBattingHand,
  cricketRolesNeedBowling,
  parseCricketRoles,
} from '@/lib/cricket-roles';
import { parseFootballRoles } from '@/lib/football-roles';
import type { SportEntry } from '@/lib/multi-sport';
import { isCricketSport, isFootballSport, normalizeSportKey } from '@/lib/sport-utils';

export type SportProfileKind = 'cricket' | 'football';

export type CricketSportProfile = {
  role: string;
  battingHand: string;
  bowlingType: string;
  allRounderType: string;
};

export type FootballSportProfile = {
  role: string;
};

export type SportProfilesMap = {
  cricket?: CricketSportProfile;
  football?: FootballSportProfile;
};

export function emptyCricketProfile(): CricketSportProfile {
  return { role: '', battingHand: '', bowlingType: '', allRounderType: '' };
}

export function emptyFootballProfile(): FootballSportProfile {
  return { role: '' };
}

export function emptySportProfiles(): SportProfilesMap {
  return {};
}

export function sportProfileKindFromEntry(s: {
  name?: string;
  sportFamily?: string;
  presetKey?: string;
}): SportProfileKind | null {
  const key = normalizeSportKey(s.presetKey);
  if (key === 'cricket') return 'cricket';
  if (key === 'football') return 'football';
  const blob = `${s.sportFamily || ''} ${s.name || ''}`.toLowerCase();
  if (/\bcricket\b/.test(blob)) return 'cricket';
  if (/\bfootball\b|\bsoccer\b/.test(blob)) return 'football';
  return null;
}

/** Unique cricket/football kinds present in the player's selected sports. */
export function profileKindsFromSelected(selected: SportEntry[]): SportProfileKind[] {
  const set = new Set<SportProfileKind>();
  for (const s of selected) {
    const k = sportProfileKindFromEntry(s);
    if (k) set.add(k);
  }
  return (['cricket', 'football'] as SportProfileKind[]).filter((k) => set.has(k));
}

/**
 * Multi-sport: kinds from selected entries.
 * Legacy (no multi / nothing selected yet): tournament main sport.
 */
export function profileKindsForRegistration(opts: {
  multiSport: boolean;
  selected: SportEntry[];
  tournamentSport?: string | null;
}): SportProfileKind[] {
  if (opts.multiSport) {
    if (opts.selected.length > 0) return profileKindsFromSelected(opts.selected);
    return [];
  }
  if (isFootballSport({ sport: opts.tournamentSport })) return ['football'];
  if (isCricketSport({ sport: opts.tournamentSport })) return ['cricket'];
  return [];
}

export function parseSportProfiles(raw: unknown): SportProfilesMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const out: SportProfilesMap = {};
  const c = o.cricket;
  if (c && typeof c === 'object' && !Array.isArray(c)) {
    const cr = c as Record<string, unknown>;
    out.cricket = {
      role: typeof cr.role === 'string' ? cr.role : '',
      battingHand: typeof cr.battingHand === 'string' ? cr.battingHand : typeof cr.batting_hand === 'string' ? cr.batting_hand : '',
      bowlingType: typeof cr.bowlingType === 'string' ? cr.bowlingType : typeof cr.bowling_type === 'string' ? cr.bowling_type : '',
      allRounderType:
        typeof cr.allRounderType === 'string'
          ? cr.allRounderType
          : typeof cr.all_rounder_type === 'string'
            ? cr.all_rounder_type
            : '',
    };
  }
  const f = o.football;
  if (f && typeof f === 'object' && !Array.isArray(f)) {
    const fr = f as Record<string, unknown>;
    out.football = {
      role: typeof fr.role === 'string' ? fr.role : '',
    };
  }
  return out;
}

/** Mirror sportProfiles into legacy role columns (prefer cricket when both). */
export function legacyFieldsFromSportProfiles(profiles: SportProfilesMap): {
  role: string;
  battingHand: string;
  bowlingType: string;
  allRounderType: string;
} {
  if (profiles.cricket) {
    return {
      role: profiles.cricket.role || '',
      battingHand: profiles.cricket.battingHand || '',
      bowlingType: profiles.cricket.bowlingType || '',
      allRounderType: profiles.cricket.allRounderType || '',
    };
  }
  if (profiles.football) {
    return {
      role: profiles.football.role || '',
      battingHand: '',
      bowlingType: '',
      allRounderType: '',
    };
  }
  return { role: '', battingHand: '', bowlingType: '', allRounderType: '' };
}

/**
 * Ensure sportProfiles exists for active kinds; seed from legacy role fields when empty.
 */
export function ensureSportProfiles(
  profiles: SportProfilesMap | undefined,
  kinds: SportProfileKind[],
  legacy?: { role?: string; battingHand?: string; bowlingType?: string; allRounderType?: string }
): SportProfilesMap {
  const next: SportProfilesMap = { ...(profiles || {}) };
  for (const kind of kinds) {
    if (kind === 'cricket' && !next.cricket) {
      next.cricket = {
        role: legacy?.role || '',
        battingHand: legacy?.battingHand || '',
        bowlingType: legacy?.bowlingType || '',
        allRounderType: legacy?.allRounderType || '',
      };
    }
    if (kind === 'football' && !next.football) {
      // Only seed football from legacy if cricket isn't also active (legacy role is cricket then).
      const seedFootball = !kinds.includes('cricket');
      next.football = {
        role: seedFootball ? legacy?.role || '' : '',
      };
    }
  }
  return next;
}

export function validateSportProfiles(
  profiles: SportProfilesMap,
  kinds: SportProfileKind[],
  required: boolean
): string | null {
  if (!required || kinds.length === 0) return null;

  if (kinds.includes('cricket')) {
    const c = profiles.cricket || emptyCricketProfile();
    const roles = parseCricketRoles(c.role);
    if (roles.length === 0) return 'Please select at least one cricket playing role.';
    if (cricketRolesNeedBattingHand(roles) && !String(c.battingHand || '').trim()) {
      return 'Please select batting hand for cricket.';
    }
    if (cricketRolesNeedBowling(roles) && !String(c.bowlingType || '').trim()) {
      return 'Please select bowling style for cricket.';
    }
  }

  if (kinds.includes('football')) {
    const f = profiles.football || emptyFootballProfile();
    if (parseFootballRoles(f.role).length === 0) {
      return 'Please select at least one football position.';
    }
  }

  return null;
}

export function formatSportProfilesExport(profiles: SportProfilesMap | null | undefined): {
  cricketRoles: string;
  cricketDetails: string;
  footballPositions: string;
} {
  const p = profiles || {};
  const cricketRoles = p.cricket?.role?.trim() || '-';
  const hand = p.cricket?.battingHand?.trim() || '';
  const bowl = p.cricket?.bowlingType?.trim() || '';
  const cricketDetails = [hand, bowl].filter(Boolean).join(' | ') || '-';
  const footballPositions = p.football?.role?.trim() || '-';
  return { cricketRoles, cricketDetails, footballPositions };
}
