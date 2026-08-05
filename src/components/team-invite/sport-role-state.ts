import {
  cricketRolesNeedBattingHand,
  cricketRolesNeedBowling,
  toggleCricketRoleString,
} from '@/lib/cricket-roles';
import { toggleFootballRoleString } from '@/lib/football-roles';
import {
  ensureSportProfiles,
  legacyFieldsFromSportProfiles,
  type SportProfileKind,
  type SportProfilesMap,
} from '@/lib/sport-profiles';
import {
  isCricketSport,
  parseSportRoles,
  toggleSportRoleString,
} from '@/lib/sport-utils';

type PlayerRoleState = {
  role: string;
  battingHand: string;
  bowlingType: string;
  allRounderType: string;
  sportProfiles: SportProfilesMap;
};

/** Classic single-sport role chip toggle (updates legacy role fields). */
export function withLegacySportRoleToggle<T extends PlayerRoleState>(
  player: T,
  sport: string | null | undefined,
  toggledRole: string
): T {
  const nextRole = toggleSportRoleString(sport, player.role || '', toggledRole);
  const rolesArr = parseSportRoles(sport, nextRole);
  const needBat = isCricketSport({ sport }) && cricketRolesNeedBattingHand(rolesArr);
  const needBowl = isCricketSport({ sport }) && cricketRolesNeedBowling(rolesArr);
  return {
    ...player,
    role: nextRole,
    battingHand: needBat ? player.battingHand : '',
    bowlingType: needBowl ? player.bowlingType : '',
    allRounderType: '',
  };
}

/** Multi-sport cricket/football profile chip toggle. */
export function withSportProfileRoleToggle<T extends PlayerRoleState>(
  player: T,
  kinds: SportProfileKind[],
  kind: SportProfileKind,
  toggledRole: string
): T {
  const profiles = ensureSportProfiles(player.sportProfiles, kinds, player);
  const current =
    kind === 'cricket' ? profiles.cricket?.role || '' : profiles.football?.role || '';
  const nextRole =
    kind === 'cricket'
      ? toggleCricketRoleString(current, toggledRole)
      : toggleFootballRoleString(current, toggledRole);

  const nextProfiles: SportProfilesMap = { ...profiles };
  if (kind === 'cricket') {
    const cur = {
      ...(profiles.cricket || {
        role: '',
        battingHand: '',
        bowlingType: '',
        allRounderType: '',
      }),
      role: nextRole,
    };
    const rolesArr = parseSportRoles('cricket', nextRole);
    if (!cricketRolesNeedBattingHand(rolesArr)) cur.battingHand = '';
    if (!cricketRolesNeedBowling(rolesArr)) cur.bowlingType = '';
    cur.allRounderType = '';
    nextProfiles.cricket = cur;
  } else {
    nextProfiles.football = {
      ...(profiles.football || { role: '' }),
      role: nextRole,
    };
  }

  const legacy = legacyFieldsFromSportProfiles(nextProfiles);
  return { ...player, sportProfiles: nextProfiles, ...legacy };
}

/** Multi-sport batting hand / bowling style field change. */
export function withSportProfileFieldChange<T extends PlayerRoleState>(
  player: T,
  kinds: SportProfileKind[],
  kind: SportProfileKind,
  field: 'battingHand' | 'bowlingType' | 'allRounderType',
  value: string
): T {
  const profiles = ensureSportProfiles(player.sportProfiles, kinds, player);
  const nextProfiles: SportProfilesMap = { ...profiles };
  if (kind === 'cricket') {
    nextProfiles.cricket = {
      ...(profiles.cricket || {
        role: '',
        battingHand: '',
        bowlingType: '',
        allRounderType: '',
      }),
      [field]: value,
    };
  } else {
    nextProfiles.football = {
      ...(profiles.football || { role: '' }),
      role: profiles.football?.role || '',
    };
  }
  const legacy = legacyFieldsFromSportProfiles(nextProfiles);
  return { ...player, sportProfiles: nextProfiles, ...legacy };
}
