import {
  newSportEntryId,
  type SportEntry,
  type SportEntryType,
} from '@/lib/multi-sport';

export type SportPresetKind = 'team' | 'racket' | 'individual';

export type SportPreset = {
  key: string;
  label: string;
  kind: SportPresetKind;
  /** Default team roster size when kind=team */
  defaultMinPlayers?: number;
  defaultMaxPlayers?: number;
  /** Suggested fees for racket formats (MS / MD / WS / WD / Mixed) */
  racketFees?: {
    mensSingles: number;
    mensDoubles: number;
    womensSingles: number;
    womensDoubles: number;
    mixed: number;
  };
  defaultFee?: number;
};

/** Popular sports in India — admin picks these instead of typing from scratch. */
export const INDIAN_SPORT_PRESETS: SportPreset[] = [
  { key: 'cricket', label: 'Cricket', kind: 'team', defaultMinPlayers: 8, defaultMaxPlayers: 11, defaultFee: 1000 },
  { key: 'football', label: 'Football', kind: 'team', defaultMinPlayers: 7, defaultMaxPlayers: 11, defaultFee: 1000 },
  { key: 'kabaddi', label: 'Kabaddi', kind: 'team', defaultMinPlayers: 7, defaultMaxPlayers: 12, defaultFee: 800 },
  { key: 'kho-kho', label: 'Kho-Kho', kind: 'team', defaultMinPlayers: 9, defaultMaxPlayers: 12, defaultFee: 500 },
  { key: 'hockey', label: 'Hockey', kind: 'team', defaultMinPlayers: 11, defaultMaxPlayers: 16, defaultFee: 1000 },
  { key: 'volleyball', label: 'Volleyball', kind: 'team', defaultMinPlayers: 6, defaultMaxPlayers: 12, defaultFee: 600 },
  { key: 'basketball', label: 'Basketball', kind: 'team', defaultMinPlayers: 5, defaultMaxPlayers: 12, defaultFee: 800 },
  {
    key: 'badminton',
    label: 'Badminton',
    kind: 'racket',
    racketFees: {
      mensSingles: 100,
      mensDoubles: 200,
      womensSingles: 100,
      womensDoubles: 200,
      mixed: 200,
    },
  },
  {
    key: 'pickleball',
    label: 'Pickleball',
    kind: 'racket',
    racketFees: {
      mensSingles: 150,
      mensDoubles: 250,
      womensSingles: 150,
      womensDoubles: 250,
      mixed: 250,
    },
  },
  {
    key: 'tennis',
    label: 'Tennis',
    kind: 'racket',
    racketFees: {
      mensSingles: 200,
      mensDoubles: 400,
      womensSingles: 200,
      womensDoubles: 400,
      mixed: 400,
    },
  },
  {
    key: 'table-tennis',
    label: 'Table Tennis',
    kind: 'racket',
    racketFees: {
      mensSingles: 100,
      mensDoubles: 150,
      womensSingles: 100,
      womensDoubles: 150,
      mixed: 150,
    },
  },
  { key: 'chess', label: 'Chess', kind: 'individual', defaultFee: 200 },
  { key: 'carrom', label: 'Carrom', kind: 'individual', defaultFee: 150 },
  { key: 'athletics', label: 'Athletics', kind: 'individual', defaultFee: 300 },
  { key: 'swimming', label: 'Swimming', kind: 'individual', defaultFee: 400 },
  { key: 'custom', label: 'Other / Custom…', kind: 'individual', defaultFee: 0 },
];

function entry(
  name: string,
  entryType: SportEntryType,
  fee: number,
  minPlayers: number,
  maxPlayers: number,
  extra?: Partial<SportEntry>
): SportEntry {
  return {
    id: newSportEntryId(),
    name,
    entryType,
    fee,
    minPlayers,
    maxPlayers,
    ...extra,
  };
}

const DEFAULT_RACKET_FEES = {
  mensSingles: 100,
  mensDoubles: 200,
  womensSingles: 100,
  womensDoubles: 200,
  mixed: 200,
};

/**
 * Expand a preset into one or more sports_config rows.
 * Racket sports create Men's/Women's Singles & Doubles + Mixed with suggested fees.
 */
export function expandSportPreset(presetKey: string): SportEntry[] {
  const preset = INDIAN_SPORT_PRESETS.find((p) => p.key === presetKey);
  if (!preset) return [];

  if (preset.kind === 'racket') {
    const fees = preset.racketFees || DEFAULT_RACKET_FEES;
    const family = { sportFamily: preset.label, presetKey: preset.key };
    return [
      entry(`${preset.label} — Men's Singles`, 'individual', fees.mensSingles, 1, 1, {
        ...family,
        formatLabel: "Men's Singles",
      }),
      entry(`${preset.label} — Men's Doubles`, 'doubles', fees.mensDoubles, 2, 2, {
        ...family,
        formatLabel: "Men's Doubles",
      }),
      entry(`${preset.label} — Women's Singles`, 'individual', fees.womensSingles, 1, 1, {
        ...family,
        formatLabel: "Women's Singles",
      }),
      entry(`${preset.label} — Women's Doubles`, 'doubles', fees.womensDoubles, 2, 2, {
        ...family,
        formatLabel: "Women's Doubles",
      }),
      entry(`${preset.label} — Mixed Doubles`, 'doubles', fees.mixed, 2, 2, {
        ...family,
        formatLabel: 'Mixed Doubles',
      }),
    ];
  }

  if (preset.kind === 'team') {
    return [
      entry(
        preset.label,
        'team',
        preset.defaultFee ?? 0,
        preset.defaultMinPlayers ?? 1,
        preset.defaultMaxPlayers ?? 11,
        { sportFamily: preset.label, presetKey: preset.key, teams: [] }
      ),
    ];
  }

  // individual / custom
  return [
    entry(
      preset.key === 'custom' ? '' : preset.label,
      'individual',
      preset.defaultFee ?? 0,
      1,
      1,
      {
        sportFamily: preset.key === 'custom' ? undefined : preset.label,
        presetKey: preset.key,
      }
    ),
  ];
}

/** Group entries by sportFamily for register UI (Badminton formats together). */
export function groupSportsForDisplay(sports: SportEntry[]): Array<{
  family: string;
  entries: SportEntry[];
}> {
  const groups: Array<{ family: string; entries: SportEntry[] }> = [];
  const indexByFamily = new Map<string, number>();

  for (const s of sports) {
    const family = (s.sportFamily || s.name.split('—')[0]?.trim() || s.name).trim();
    const existing = indexByFamily.get(family);
    if (existing != null) {
      groups[existing].entries.push(s);
    } else {
      indexByFamily.set(family, groups.length);
      groups.push({ family, entries: [s] });
    }
  }
  return groups;
}
