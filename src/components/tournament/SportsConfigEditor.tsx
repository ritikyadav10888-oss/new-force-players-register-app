'use client';

import { toast } from 'sonner';
import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  type SportEntry,
  type SportEntryType,
} from '@/lib/multi-sport';
import { expandSportPreset, INDIAN_SPORT_PRESETS } from '@/lib/sport-presets';

type Props = {
  sports: SportEntry[];
  onSportsChange: (next: SportEntry[]) => void;
  /** Tournament team roster bounds — applied to all team sports */
  teamMinPlayers?: number;
  teamMaxPlayers?: number;
};

type FormatTypeOption = {
  key: string;
  label: string;
  entryType: SportEntryType;
};

/** Men's / Women's / Mixed — only for Pickleball, Badminton, Tennis, Table Tennis. */
const RACKET_FORMAT_OPTIONS: FormatTypeOption[] = [
  { key: 'mens-singles', label: "Men's Singles", entryType: 'individual' },
  { key: 'mens-doubles', label: "Men's Doubles", entryType: 'doubles' },
  { key: 'womens-singles', label: "Women's Singles", entryType: 'individual' },
  { key: 'womens-doubles', label: "Women's Doubles", entryType: 'doubles' },
  { key: 'mixed-doubles', label: 'Mixed Doubles', entryType: 'doubles' },
];

const BASE_FORMAT_OPTIONS: FormatTypeOption[] = [
  { key: 'individual', label: 'Individual / Singles', entryType: 'individual' },
  { key: 'doubles', label: 'Doubles', entryType: 'doubles' },
  { key: 'team', label: 'Team', entryType: 'team' },
];

const RACKET_PRESET_KEYS = new Set(['badminton', 'pickleball', 'tennis', 'table-tennis']);

/** Internal marker so Type stays on Custom… even before the admin types a name. */
const CUSTOM_FORMAT_SENTINEL = '__custom__';

function isRacketSportEntry(s: SportEntry): boolean {
  const key = (s.presetKey || '').toLowerCase();
  if (RACKET_PRESET_KEYS.has(key)) return true;
  const family = (s.sportFamily || s.name.split('—')[0] || '').trim().toLowerCase();
  return (
    family === 'badminton' ||
    family === 'pickleball' ||
    family === 'tennis' ||
    family === 'table tennis' ||
    family === 'table-tennis'
  );
}

function typeOptionsForSport(s: SportEntry): FormatTypeOption[] {
  return isRacketSportEntry(s)
    ? [...RACKET_FORMAT_OPTIONS, ...BASE_FORMAT_OPTIONS]
    : BASE_FORMAT_OPTIONS;
}

function isCustomTypeSelected(s: SportEntry): boolean {
  const raw = (s.formatLabel || '').trim();
  if (!raw || raw === CUSTOM_FORMAT_SENTINEL) {
    // Only treat empty as custom when we intentionally set the sentinel,
    // or when formatLabel is the sentinel. Empty/undefined = use entryType presets.
    return raw === CUSTOM_FORMAT_SENTINEL;
  }
  const options = typeOptionsForSport(s);
  return !options.some((o) => o.label.toLowerCase() === raw.toLowerCase());
}

function formatTypeSelectValue(s: SportEntry): string {
  if (isCustomTypeSelected(s)) return 'custom';
  const options = typeOptionsForSport(s);
  const label = (s.formatLabel || '').trim().toLowerCase();
  if (label) {
    const match = options.find((o) => o.label.toLowerCase() === label);
    if (match) return match.key;
  }
  if (s.entryType === 'team') return 'team';
  if (s.entryType === 'doubles') return 'doubles';
  return 'individual';
}

function customTypeInputValue(s: SportEntry): string {
  const raw = s.formatLabel || '';
  if (raw.trim() === CUSTOM_FORMAT_SENTINEL) return '';
  if (isCustomTypeSelected(s)) return raw;
  return '';
}

function applyTeamBounds(sport: SportEntry, teamMin: number, teamMax: number): SportEntry {
  if (sport.entryType !== 'team') return sport;
  const minPlayers = Math.max(1, teamMin);
  const maxPlayers = Math.max(minPlayers, teamMax);
  if (sport.minPlayers === minPlayers && sport.maxPlayers === maxPlayers) return sport;
  return { ...sport, minPlayers, maxPlayers, teams: undefined };
}

export function SportsConfigEditor({
  sports,
  onSportsChange,
  teamMinPlayers = 1,
  teamMaxPlayers = 11,
}: Props) {
  const [presetKey, setPresetKey] = useState('cricket');
  const teamMin = Math.max(1, Number(teamMinPlayers) || 1);
  const teamMax = Math.max(teamMin, Number(teamMaxPlayers) || teamMin);
  const onSportsChangeRef = useRef(onSportsChange);
  onSportsChangeRef.current = onSportsChange;
  const sportsRef = useRef(sports);
  sportsRef.current = sports;

  // Keep team-sport capacity in sync with tournament Min/Max Players Per Team.
  useEffect(() => {
    const current = sportsRef.current;
    let changed = false;
    const next = current.map((s) => {
      const synced = applyTeamBounds(s, teamMin, teamMax);
      if (synced !== s) changed = true;
      return synced;
    });
    if (changed) onSportsChangeRef.current(next);
  }, [teamMin, teamMax]);

  const updateSport = (id: string, patch: Partial<SportEntry>) => {
    onSportsChange(
      sports.map((s) => {
        if (s.id !== id) return s;
        const next = { ...s, ...patch };
        if (next.entryType === 'individual') {
          next.minPlayers = 1;
          next.maxPlayers = 1;
          next.teams = undefined;
        } else if (next.entryType === 'doubles') {
          next.minPlayers = 2;
          next.maxPlayers = 2;
          next.teams = undefined;
        } else {
          next.minPlayers = teamMin;
          next.maxPlayers = teamMax;
          next.teams = undefined;
        }
        return next;
      })
    );
  };

  const addFromPreset = () => {
    const expanded = expandSportPreset(presetKey);
    if (expanded.length === 0) return;
    if (presetKey !== 'custom') {
      const family = expanded[0]?.sportFamily || expanded[0]?.name;
      const already = sports.some(
        (s) =>
          s.presetKey === presetKey ||
          s.sportFamily === family ||
          s.name === family ||
          s.name.startsWith(`${family} —`)
      );
      if (already) {
        toast.error(`${family} is already in the list. Remove it first to re-add.`);
        return;
      }
    }
    onSportsChange([
      ...sports,
      ...expanded.map((s) => applyTeamBounds(s, teamMin, teamMax)),
    ]);
  };

  const removeSport = (id: string) => {
    onSportsChange(sports.filter((s) => s.id !== id));
  };

  const selectedPreset = INDIAN_SPORT_PRESETS.find((p) => p.key === presetKey);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <h3 style={{ margin: '0 0 0.35rem', fontSize: '1.05rem', color: '#e2e8f0' }}>
          Multi-sport entries (optional)
        </h3>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.45 }}>
          Pick sports and fees. For Team sports, players enter <strong>one team name</strong> and
          enroll that squad in all selected sports. Roster size uses{' '}
          <strong>Min / Max Players Per Team</strong> above (not per sport).
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'flex-end' }}>
        <label
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.3rem',
            fontSize: '0.8rem',
            color: '#94a3b8',
            minWidth: 200,
            flex: 1,
          }}
        >
          Add from preset
          <select
            value={presetKey}
            onChange={(e) => setPresetKey(e.target.value)}
            style={{ padding: '0.45rem 0.55rem' }}
          >
            {INDIAN_SPORT_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
                {p.kind === 'racket' ? " (Men's / Women's / Mixed)" : ''}
                {p.kind === 'team' ? ' (Team)' : ''}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn-primary"
          onClick={addFromPreset}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
        >
          <Plus size={16} /> Add sport
        </button>
        {selectedPreset?.kind === 'racket' && (
          <p style={{ margin: 0, width: '100%', fontSize: '0.78rem', color: '#a5b4fc' }}>
            Adds Men&apos;s / Women&apos;s Singles &amp; Doubles + Mixed (Pickleball, Badminton, Tennis,
            Table Tennis only). Edit fees below.
          </p>
        )}
      </div>

      {sports.length === 0 ? (
        <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
          No multi-sport entries — classic single-fee mode.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {sports.map((s, idx) => (
            <div
              key={s.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: '0.65rem',
                padding: '0.85rem',
                background: 'rgba(0,0,0,0.2)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gap: '0.65rem',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  alignItems: 'end',
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.3rem',
                    fontSize: '0.8rem',
                    color: '#94a3b8',
                  }}
                >
                  Sport / format name *
                  <input
                    value={s.name}
                    onChange={(e) => updateSport(s.id, { name: e.target.value })}
                    placeholder={`e.g. Sport ${idx + 1}`}
                    style={{ padding: '0.45rem 0.55rem' }}
                  />
                </label>
                <label
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.3rem',
                    fontSize: '0.8rem',
                    color: '#94a3b8',
                  }}
                >
                  Type
                  <select
                    value={formatTypeSelectValue(s)}
                    onChange={(e) => {
                      const key = e.target.value;
                      const options = typeOptionsForSport(s);
                      if (key === 'custom') {
                        // Clear preset label so Custom fields show (do not keep Men's Singles etc.)
                        updateSport(s.id, { formatLabel: CUSTOM_FORMAT_SENTINEL });
                        return;
                      }
                      const opt = options.find((o) => o.key === key);
                      if (!opt) return;
                      updateSport(s.id, {
                        entryType: opt.entryType,
                        formatLabel: opt.label,
                      });
                    }}
                    style={{ padding: '0.45rem 0.55rem' }}
                  >
                    {typeOptionsForSport(s).map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                    <option value="custom">Custom…</option>
                  </select>
                </label>
                {formatTypeSelectValue(s) === 'custom' && (
                  <>
                    <label
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.3rem',
                        fontSize: '0.8rem',
                        color: '#94a3b8',
                      }}
                    >
                      Custom type name *
                      <input
                        value={customTypeInputValue(s)}
                        onChange={(e) => {
                          const v = e.target.value;
                          updateSport(s.id, {
                            formatLabel: v.trim() ? v : CUSTOM_FORMAT_SENTINEL,
                          });
                        }}
                        placeholder="e.g. U-18 Singles"
                        style={{ padding: '0.45rem 0.55rem' }}
                      />
                    </label>
                    <label
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.3rem',
                        fontSize: '0.8rem',
                        color: '#94a3b8',
                      }}
                    >
                      Players
                      <select
                        value={s.entryType}
                        onChange={(e) =>
                          updateSport(s.id, {
                            entryType: e.target.value as SportEntryType,
                            // Keep custom mode while changing roster size
                            formatLabel:
                              customTypeInputValue(s).trim() || CUSTOM_FORMAT_SENTINEL,
                          })
                        }
                        style={{ padding: '0.45rem 0.55rem' }}
                      >
                        <option value="individual">1 — Singles / Individual</option>
                        <option value="doubles">2 — Doubles</option>
                        <option value="team">Team roster</option>
                      </select>
                    </label>
                  </>
                )}                <label
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.3rem',
                    fontSize: '0.8rem',
                    color: '#94a3b8',
                  }}
                >
                  Fee (₹)
                  <input
                    type="number"
                    min={0}
                    value={s.fee}
                    onChange={(e) => updateSport(s.id, { fee: Number(e.target.value) || 0 })}
                    style={{ padding: '0.45rem 0.55rem' }}
                  />
                </label>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => removeSport(s.id)}
                    className="btn-secondary"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontSize: '0.8rem',
                    }}
                  >
                    <Trash2 size={14} /> Remove
                  </button>
                </div>
              </div>

              {s.entryType === 'team' && (
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8' }}>
                  Roster capacity for {s.name || 'this sport'}: {teamMin}–{teamMax} players (from
                  team settings above).
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
