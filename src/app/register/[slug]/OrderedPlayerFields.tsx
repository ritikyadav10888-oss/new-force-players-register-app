'use client';

import { useState, useEffect, type ChangeEvent, type RefObject } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Image as ImageIcon, Ruler, User } from 'lucide-react';
import {
  CRICKET_ROLES,
  cricketRolesNeedBattingHand,
  cricketRolesNeedBowling,
  normalizeBattingHandUi,
  parseCricketRoles,
} from '@/lib/cricket-roles';
import { FOOTBALL_ROLES } from '@/lib/football-roles';
import { isCustomFieldOrderKey, parseCustomFieldId, resolveStandardFieldLabel } from '@/lib/form-config';
import {
  ensureSportProfiles,
  type SportProfileKind,
  type SportProfilesMap,
} from '@/lib/sport-profiles';
import {
  isCricketSport,
  isFootballSport,
  parseSportRoles,
} from '@/lib/sport-utils';
import {
  categoriesForDisplay,
  categoryMatchesPlayer,
  findAgeCategoryById,
  formatAgeCategoryRange,
  resolveAgeCategoryName,
  type AgeCategoryDef,
} from '@/lib/age-categories';
import {
  getCustomValue,
  resolveCustomFieldValidation,
  sanitizeCustomFieldInput,
  type CustomFieldDef,
} from '@/lib/custom-fields';
import styles from './register.module.css';

const BATTING_HANDS = ['Right-Hand', 'Left-Hand'] as const;
const BOWLING_STYLES = [
  'Right Hand Fast',
  'Left Hand Fast',
  'Right Spinner',
  'Left Spinner',
] as const;

const selectStyle = {
  padding: '0.75rem',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  color: 'white',
  cursor: 'pointer',
} as const;

const JERSEY_SIZES = [
  '1-2 Years',
  '3-4 Years',
  '5-6 Years',
  '7-8 Years',
  '9-10 Years',
  '11-12 Years',
  'XXS',
  'XS',
  'S',
  'M',
  'L',
  'XL',
  '2XL',
  '3XL',
  '4XL',
  '5XL',
  '6XL',
] as const;

/** Size chart: size â†’ code â†’ width Ã— length (inches). */
const JERSEY_SIZE_GUIDE: { size: string; code: string; measurement: string }[] = [
  { size: '1-2 Years', code: '22', measurement: '12 Ã— 20' },
  { size: '3-4 Years', code: '24', measurement: '13 Ã— 21' },
  { size: '5-6 Years', code: '26', measurement: '14 Ã— 22' },
  { size: '7-8 Years', code: '28', measurement: '15 Ã— 23' },
  { size: '9-10 Years', code: '30', measurement: '16 Ã— 24' },
  { size: '11-12 Years', code: '32', measurement: '17 Ã— 25' },
  { size: 'XXS', code: '34', measurement: '19 Ã— 27' },
  { size: 'XS', code: '36', measurement: '20 Ã— 28' },
  { size: 'S', code: '38', measurement: '21 Ã— 29' },
  { size: 'M', code: '40', measurement: '22 Ã— 30' },
  { size: 'L', code: '42', measurement: '23 Ã— 31' },
  { size: 'XL', code: '44', measurement: '24 Ã— 33' },
  { size: '2XL', code: '46', measurement: '25 Ã— 34' },
  { size: '3XL', code: '48', measurement: '26 Ã— 35' },
  { size: '4XL', code: '50', measurement: '27 Ã— 36' },
  { size: '5XL', code: '52', measurement: '28 Ã— 37' },
  { size: '6XL', code: '54', measurement: '29 Ã— 38' },
];

function JerseySizeGuide({ selectedSize }: { selectedSize?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.jerseySizeGuide}>
      <button
        type="button"
        className={styles.jerseySizeGuideToggle}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Ruler size={14} />
        {open ? 'Hide size guide' : 'View size guide'}
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open ? (
        <div className={styles.jerseySizeGuidePanel}>
          <p className={styles.jerseySizeGuideHint}>
            Measurements are chest width Ã— length (inches). Pick the size closest to your fit.
          </p>
          <div className={styles.jerseySizeGuideTableWrap}>
            <table className={styles.jerseySizeGuideTable}>
              <thead>
                <tr>
                  <th>Size</th>
                  <th>Code</th>
                  <th>Width Ã— Length</th>
                </tr>
              </thead>
              <tbody>
                {JERSEY_SIZE_GUIDE.map((row) => {
                  const active = selectedSize === row.size;
                  return (
                    <tr key={row.size} className={active ? styles.jerseySizeGuideRowActive : undefined}>
                      <td>{row.size}</td>
                      <td>{row.code}</td>
                      <td>{row.measurement}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export type OrderedPlayerValues = {
  name?: string;
  email?: string;
  phone?: string;
  emergencyContact?: string;
  dob?: string;
  age?: string;
  aadhar?: string;
  gender?: string;
  jerseyName?: string;
  jerseyNumber?: string;
  jerseySize?: string;
  photo?: string;
  role?: string;
  battingHand?: string;
  bowlingType?: string;
  allRounderType?: string;
  sportProfiles?: SportProfilesMap;
  customValues?: Record<string, string>;
};

type FieldFlags = { enabled?: boolean; required?: boolean; label?: string };

type Props = {
  fieldKeys: string[];
  player: OrderedPlayerValues;
  config: Record<string, FieldFlags | undefined>;
  tournament: {
    sport?: string;
    customFields?: any[];
    ageCategories?: AgeCategoryDef[] | null;
  };
  /** Category chosen on overview (step 1). Shown on Age field; DOB must match. */
  selectedAgeCategoryId?: string | null;
  onChange: (key: string, value: string) => void;
  onCustomChange: (label: string, value: string) => void;
  onSportRoleToggle: (role: string) => void;
  /** When set, show cricket/football blocks from selected sports (multi-sport). */
  profileKinds?: SportProfileKind[];
  /** Multi-sport mode: only show profiles for selected cricket/football (never fall back to main sport). */
  preferSelectedSportProfiles?: boolean;
  onSportProfileRoleToggle?: (kind: SportProfileKind, role: string) => void;
  onSportProfileFieldChange?: (
    kind: SportProfileKind,
    field: 'battingHand' | 'bowlingType' | 'allRounderType',
    value: string
  ) => void;
  formatPhoneNumber: (value: string) => string;
  /** Team roster uses compact photo row; individual spans full grid. */
  variant: 'team' | 'individual';
  playerIndex?: number;
  photoFileLabel?: string;
  onPhotoUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  photoInputRef?: RefObject<HTMLInputElement | null>;
  onPhotoChooseClick?: () => void;
};

function FlagRequired({ required }: { required?: boolean }) {
  if (!required) return null;
  return <span style={{ color: 'var(--error)' }}>*</span>;
}

function shortCategoryLabel(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'Category';
  if (/^open\b/i.test(trimmed) || /open age/i.test(trimmed)) return 'Open';
  const youth = trimmed.match(/^(U-?\d+)/i);
  if (youth) return youth[1].toUpperCase();
  if (trimmed.length <= 22) return trimmed;
  return `${trimmed.slice(0, 20).trim()}…`;
}

function AgeCategoryField({
  required,
  dob,
  age,
  categories,
  selectedAgeCategoryId,
  combined = false,
  onDobChange,
  dobRequired,
  dobLabel = 'Date of Birth',
  ageLabel = 'Age & eligibility',
}: {
  required?: boolean;
  dob: string;
  age: string;
  categories?: AgeCategoryDef[] | null;
  selectedAgeCategoryId?: string | null;
  combined?: boolean;
  onDobChange?: (value: string) => void;
  dobRequired?: boolean;
  dobLabel?: string;
  ageLabel?: string;
}) {
  const list = categoriesForDisplay(categories);
  const selectedCat = findAgeCategoryById(categories, selectedAgeCategoryId);
  const dobMatchesSelected =
    selectedCat && dob ? categoryMatchesPlayer(selectedCat, dob) : null;
  const inferredName = !selectedCat ? resolveAgeCategoryName(dob, categories) : null;
  const [showCategories, setShowCategories] = useState(false);
  const pillMismatch = Boolean(selectedCat && dob && dobMatchesSelected === false);

  useEffect(() => {
    if (pillMismatch) setShowCategories(true);
  }, [pillMismatch]);

  const selectedRange =
    selectedCat && formatAgeCategoryRange(selectedCat) !== 'All ages'
      ? formatAgeCategoryRange(selectedCat)
      : null;
  const verified = Boolean(selectedCat && dob && dobMatchesSelected);
  const matchedName = inferredName;
  const shortLabel = selectedCat
    ? shortCategoryLabel(selectedCat.name)
    : matchedName
      ? shortCategoryLabel(matchedName)
      : null;

  const wrapClass = combined ? styles.dobAgeRow : styles.ageFieldWrap;

  const eligibilityBlock = (
    <>
        {required ? (
          <input type="hidden" name="player-age" value={age || ''} required={required} readOnly />
        ) : null}

        <div
          className={[
            styles.eligibilityPanel,
            combined ? styles.eligibilityPanelCompact : '',
            verified ? styles.eligibilityPanelOk : '',
            pillMismatch ? styles.eligibilityPanelError : '',
            !dob && selectedCat ? styles.eligibilityPanelPending : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div className={styles.eligibilityPanelMain}>
            <div className={styles.eligibilityPanelStatus}>
              {pillMismatch ? (
                <>
                  <AlertCircle size={18} className={styles.eligibilityPanelIconError} aria-hidden />
                  <span className={styles.eligibilityPanelStatusText}>Not eligible</span>
                </>
              ) : verified ? (
                <>
                  <CheckCircle2 size={18} className={styles.eligibilityPanelIconOk} aria-hidden />
                  <span className={styles.eligibilityPanelStatusText}>Verified</span>
                </>
              ) : (
                <span className={styles.eligibilityPanelStatusTextMuted}>
                  {dob ? 'Checking…' : 'Awaiting DOB'}
                </span>
              )}
            </div>
            <div className={styles.eligibilityPanelAge} aria-label={age ? `Age ${age} years` : 'Age pending'}>
              <span className={styles.eligibilityPanelAgeValue}>{age || '—'}</span>
              <span className={styles.eligibilityPanelAgeUnit}>{combined ? 'yrs' : 'years'}</span>
            </div>
          </div>

          {!combined && selectedCat ? (
            <div className={styles.eligibilityPanelCategory}>
              <p className={styles.eligibilityPanelCategoryName} title={selectedCat.name}>
                {shortLabel}
              </p>
              {selectedRange ? (
                <p className={styles.eligibilityPanelCategoryRange}>Eligible range: {selectedRange}</p>
              ) : null}
            </div>
          ) : null}
          {!combined && !selectedCat && matchedName ? (
            <p className={styles.eligibilityPanelCategoryRange}>Matched category: {shortCategoryLabel(matchedName)}</p>
          ) : null}
          {!combined && !selectedCat && !matchedName ? (
            <p className={styles.eligibilityPanelCategoryRange}>
              {dob ? 'No category matches this date of birth.' : 'Enter date of birth to verify eligibility.'}
            </p>
          ) : null}
          {combined && selectedCat ? (
            <p className={styles.eligibilityPanelCompactMeta} title={selectedCat.name}>
              {shortLabel}
              {selectedRange ? ` · ${selectedRange}` : ''}
            </p>
          ) : null}
        </div>
    </>
  );

  const footerBlock = (
    <>
        {pillMismatch && selectedCat ? (
          <p className={styles.ageCategoryLiveWarn} role="alert">
            Your DOB does not fit <strong title={selectedCat.name}>{shortLabel}</strong>
            {selectedRange ? ` (${selectedRange})` : ''}. Go back to step 1 to change category, or update
            your date of birth.
          </p>
        ) : null}

        {list.length > 1 ? (
          <button
            type="button"
            className={styles.ageCategoryToggle}
            aria-expanded={showCategories}
            onClick={() => setShowCategories((v) => !v)}
          >
            {showCategories ? 'Hide all categories' : 'View all age categories'}
            {showCategories ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        ) : null}

      {showCategories && list.length > 0 ? (
        <div className={styles.ageCategoryGuidePanel}>
          <p className={styles.ageCategoryGuideHeading}>All tournament categories</p>
          <div className={styles.ageCategoryGuide} role="note" aria-label="Age categories">
            {list.map((cat) => {
              const isSelected = selectedCat?.id === cat.id;
              const matchesDob = dob ? categoryMatchesPlayer(cat, dob) : false;
              return (
                <div
                  key={cat.id}
                  className={[
                    styles.ageCategoryCard,
                    isSelected ? styles.ageCategoryCardSelected : '',
                    isSelected && dob && !matchesDob ? styles.ageCategoryCardMismatch : '',
                    matchesDob && dob ? styles.ageCategoryCardFits : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <div className={styles.ageCategoryCardTop}>
                    <span className={styles.ageCategoryCardTitle} title={cat.name}>
                      {shortCategoryLabel(cat.name)}
                      {isSelected ? (
                        <span className={styles.ageCategorySelectedBadge}>Yours</span>
                      ) : null}
                    </span>
                    <span className={styles.ageCategoryCardRange}>
                      {formatAgeCategoryRange(cat)}
                      {dob ? (matchesDob ? ' · ✓' : ' · ✗') : ''}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </>
  );

  if (combined) {
    return (
      <div className={wrapClass}>
        <div className={styles.dobAgeCols}>
          <div className={styles.formGroup}>
            <label>
              {dobLabel} <FlagRequired required={dobRequired} />
            </label>
            <input
              type="date"
              required={dobRequired}
              value={dob || ''}
              onChange={(e) => onDobChange?.(e.target.value)}
            />
          </div>
          <div className={`${styles.formGroup} ${styles.ageFieldWrapCombined}`}>
            <label className={styles.ageFieldLabel}>
              {ageLabel} <FlagRequired required={required} />
            </label>
            {eligibilityBlock}
          </div>
        </div>
        {footerBlock}
      </div>
    );
  }

  return (
    <div className={wrapClass}>
      <div className={styles.formGroup}>
        <label className={styles.ageFieldLabel}>
          {ageLabel} <FlagRequired required={required} />
        </label>
        {eligibilityBlock}

        {footerBlock}
      </div>
    </div>
  );
}
export function OrderedPlayerFields({
  fieldKeys,
  player,
  config,
  tournament,
  selectedAgeCategoryId,
  onChange,
  onCustomChange,
  onSportRoleToggle,
  profileKinds,
  preferSelectedSportProfiles = false,
  onSportProfileRoleToggle,
  onSportProfileFieldChange,
  formatPhoneNumber,
  variant,
  playerIndex = 0,
  photoFileLabel,
  onPhotoUpload,
  photoInputRef,
  onPhotoChooseClick,
}: Props) {
  const customFields: any[] = tournament.customFields || [];
  const kinds = Array.isArray(profileKinds) ? profileKinds : [];
  const usePerSportProfiles =
    preferSelectedSportProfiles || (kinds.length > 0 && Boolean(onSportProfileRoleToggle));

  const renderCricketBlock = (
    roleStr: string,
    battingHand: string,
    bowlingType: string,
    onToggle: (role: string) => void,
    onField: (field: 'battingHand' | 'bowlingType', value: string) => void,
    title: string
  ) => (
    <div
      className={styles.cricketBlock}
      style={variant === 'individual' ? { gridColumn: '1 / -1' } : undefined}
    >
      <div className={styles.cricketRoleTitle}>{title}</div>
      <p className={styles.cricketRoleHint}>
        Select one or more roles. Batting hand applies for batsman, wicketkeeper, or all-rounder;
        bowling style for bowler or all-rounder (both sections if you pick e.g. batsman and bowler).
      </p>
      <div
        className={styles.roleChipRow}
        role="group"
        aria-label={title}
        aria-multiselectable="true"
      >
        {CRICKET_ROLES.map((r) => {
          const selected = parseCricketRoles(roleStr).includes(r);
          return (
            <button
              key={r}
              type="button"
              aria-pressed={selected}
              className={`${styles.roleChip} ${selected ? styles.roleChipActive : ''}`}
              onClick={() => onToggle(r)}
            >
              {r}
            </button>
          );
        })}
      </div>

      {cricketRolesNeedBattingHand(parseCricketRoles(roleStr)) && (
        <div className="animate-fade-in">
          <div className={styles.cricketSubLabel}>Batting hand</div>
          <div className={styles.segmentWrap} role="group" aria-label="Batting hand">
            {BATTING_HANDS.map((h) => (
              <button
                key={h}
                type="button"
                className={`${styles.segmentBtn} ${normalizeBattingHandUi(battingHand) === h ? styles.segmentBtnActive : ''}`}
                onClick={() => onField('battingHand', h)}
              >
                {h}
              </button>
            ))}
          </div>
        </div>
      )}

      {cricketRolesNeedBowling(parseCricketRoles(roleStr)) && (
        <div className="animate-fade-in">
          <div className={styles.cricketSubLabel}>Bowling style</div>
          <div className={styles.bowlingGrid}>
            {BOWLING_STYLES.map((opt) => (
              <button
                key={opt}
                type="button"
                className={`${styles.bowlingChip} ${bowlingType === opt ? styles.bowlingChipActive : ''}`}
                onClick={() => onField('bowlingType', opt)}
              >
                {bowlingType === opt ? <span className={styles.bowlingChipMark}>✓</span> : null}
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderFootballBlock = (
    roleStr: string,
    onToggle: (role: string) => void,
    title: string
  ) => (
    <div
      className={styles.cricketBlock}
      style={variant === 'individual' ? { gridColumn: '1 / -1' } : undefined}
    >
      <div className={styles.cricketRoleTitle}>{title}</div>
      <p className={styles.cricketRoleHint}>
        Select one or more positions (e.g. midfielder and winger). You can pick multiple chips.
      </p>
      <div
        className={styles.roleChipRow}
        role="group"
        aria-label={title}
        aria-multiselectable="true"
      >
        {FOOTBALL_ROLES.map((r) => {
          const selected = parseSportRoles('Football', roleStr).includes(r);
          return (
            <button
              key={r}
              type="button"
              aria-pressed={selected}
              className={`${styles.roleChip} ${selected ? styles.roleChipActive : ''}`}
              onClick={() => onToggle(r)}
            >
              {r}
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderSportsProfile = () => {
    if (preferSelectedSportProfiles) {
      if (kinds.length === 0 || !onSportProfileRoleToggle) {
        return null;
      }
      const profiles = ensureSportProfiles(player.sportProfiles, kinds, {
        role: player.role,
        battingHand: player.battingHand,
        bowlingType: player.bowlingType,
        allRounderType: player.allRounderType,
      });
      const playerLabel = variant === 'team' ? ` (player ${playerIndex + 1})` : '';
      return (
        <div
          key="cricketProfile"
          style={
            variant === 'individual'
              ? { gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '1rem' }
              : { display: 'flex', flexDirection: 'column', gap: '1rem' }
          }
        >
          {kinds.includes('cricket') &&
            renderCricketBlock(
              profiles.cricket?.role || '',
              profiles.cricket?.battingHand || '',
              profiles.cricket?.bowlingType || '',
              (r) => onSportProfileRoleToggle('cricket', r),
              (field, value) => onSportProfileFieldChange?.('cricket', field, value),
              `Cricket — Playing role${playerLabel}`
            )}
          {kinds.includes('football') &&
            renderFootballBlock(
              profiles.football?.role || '',
              (r) => onSportProfileRoleToggle('football', r),
              `Football — Position${playerLabel}`
            )}
        </div>
      );
    }

    if (usePerSportProfiles && onSportProfileRoleToggle && kinds.length > 0) {
      const profiles = ensureSportProfiles(player.sportProfiles, kinds, {
        role: player.role,
        battingHand: player.battingHand,
        bowlingType: player.bowlingType,
        allRounderType: player.allRounderType,
      });
      const playerLabel = variant === 'team' ? ` (player ${playerIndex + 1})` : '';
      return (
        <div
          key="cricketProfile"
          style={
            variant === 'individual'
              ? { gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '1rem' }
              : { display: 'flex', flexDirection: 'column', gap: '1rem' }
          }
        >
          {kinds.includes('cricket') &&
            renderCricketBlock(
              profiles.cricket?.role || '',
              profiles.cricket?.battingHand || '',
              profiles.cricket?.bowlingType || '',
              (r) => onSportProfileRoleToggle('cricket', r),
              (field, value) => onSportProfileFieldChange?.('cricket', field, value),
              `Cricket — Playing role${playerLabel}`
            )}
          {kinds.includes('football') &&
            renderFootballBlock(
              profiles.football?.role || '',
              (r) => onSportProfileRoleToggle('football', r),
              `Football — Position${playerLabel}`
            )}
        </div>
      );
    }

    if (isCricketSport(tournament)) {
      return (
        <div
          key="cricketProfile"
          className={styles.cricketBlock}
          style={variant === 'individual' ? { gridColumn: '1 / -1' } : undefined}
        >
          <div className={styles.cricketRoleTitle}>
            {variant === 'team' ? `Playing role (player ${playerIndex + 1})` : 'Playing role'}
          </div>
          <p className={styles.cricketRoleHint}>
            Select one or more roles. Batting hand applies for batsman, wicketkeeper, or all-rounder;
            bowling style for bowler or all-rounder (both sections if you pick e.g. batsman and bowler).
          </p>
          <div
            className={styles.roleChipRow}
            role="group"
            aria-label={variant === 'team' ? `Playing roles player ${playerIndex + 1}` : 'Playing roles'}
            aria-multiselectable="true"
          >
            {CRICKET_ROLES.map((r) => {
              const selected = parseCricketRoles(player.role).includes(r);
              return (
                <button
                  key={r}
                  type="button"
                  aria-pressed={selected}
                  className={`${styles.roleChip} ${selected ? styles.roleChipActive : ''}`}
                  onClick={() => onSportRoleToggle(r)}
                >
                  {r}
                </button>
              );
            })}
          </div>

          {cricketRolesNeedBattingHand(parseCricketRoles(player.role)) && (
            <div className="animate-fade-in">
              <div className={styles.cricketSubLabel}>Batting hand</div>
              <div className={styles.segmentWrap} role="group" aria-label="Batting hand">
                {BATTING_HANDS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    className={`${styles.segmentBtn} ${normalizeBattingHandUi(player.battingHand) === h ? styles.segmentBtnActive : ''}`}
                    onClick={() => onChange('battingHand', h)}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          )}

          {cricketRolesNeedBowling(parseCricketRoles(player.role)) && (
            <div className="animate-fade-in">
              <div className={styles.cricketSubLabel}>Bowling style</div>
              <div className={styles.bowlingGrid}>
                {BOWLING_STYLES.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className={`${styles.bowlingChip} ${player.bowlingType === opt ? styles.bowlingChipActive : ''}`}
                    onClick={() => onChange('bowlingType', opt)}
                  >
                    {player.bowlingType === opt ? <span className={styles.bowlingChipMark}>âœ“</span> : null}
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (isFootballSport(tournament)) {
      return (
        <div
          key="cricketProfile"
          className={styles.cricketBlock}
          style={variant === 'individual' ? { gridColumn: '1 / -1' } : undefined}
        >
          <div className={styles.cricketRoleTitle}>
            {variant === 'team' ? `Position (player ${playerIndex + 1})` : 'Position'}
          </div>
          <p className={styles.cricketRoleHint}>
            Select one or more positions (e.g. midfielder and winger). You can pick multiple chips.
          </p>
          <div
            className={styles.roleChipRow}
            role="group"
            aria-label={variant === 'team' ? `Football positions player ${playerIndex + 1}` : 'Football positions'}
            aria-multiselectable="true"
          >
            {FOOTBALL_ROLES.map((r) => {
              const selected = parseSportRoles(tournament?.sport, player.role).includes(r);
              return (
                <button
                  key={r}
                  type="button"
                  aria-pressed={selected}
                  className={`${styles.roleChip} ${selected ? styles.roleChipActive : ''}`}
                  onClick={() => onSportRoleToggle(r)}
                >
                  {r}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    // Other sports â€” unstructured role UI
    return (
      <div key="cricketProfile" style={variant === 'individual' ? { display: 'contents' } : undefined}>
        <div
          className={styles.formGroup}
          style={variant === 'individual' ? { gridColumn: '1 / -1' } : undefined}
        >
          <label>
            {resolveStandardFieldLabel('cricketProfile', config as Record<string, unknown>)}{' '}
            <FlagRequired required={config.cricketProfile?.required} />
          </label>
          {config.cricketProfile?.required && variant === 'individual' ? (
            <input
              type="text"
              required
              placeholder="Enter your playing role / position"
              value={player.role || ''}
              onChange={(e) => onChange('role', e.target.value)}
            />
          ) : (
            <select
              required={config.cricketProfile?.required}
              value={player.role || ''}
              onChange={(e) => onChange('role', e.target.value)}
              style={selectStyle}
            >
              <option value="">-- Select playing role --</option>
              <option value="Batsman">Batsman</option>
              <option value="Bowler">Bowler</option>
              <option value="All-rounder">All-rounder</option>
              <option value="Wicketkeeper">Wicketkeeper</option>
            </select>
          )}
        </div>

        {(player.role === 'Batsman' || player.role === 'Wicketkeeper') && (
          <div className={styles.formGroup}>
            <label>Batting hand</label>
            <select
              value={player.battingHand || ''}
              onChange={(e) => onChange('battingHand', e.target.value)}
              style={selectStyle}
            >
              <option value="">-- Select hand --</option>
              <option value="Right-handed">Right-handed</option>
              <option value="Left-handed">Left-handed</option>
            </select>
          </div>
        )}

        {player.role === 'All-rounder' && (
          <div className={styles.formGroup}>
            <label>All-rounder specialty</label>
            <select
              value={player.allRounderType || ''}
              onChange={(e) => onChange('allRounderType', e.target.value)}
              style={selectStyle}
            >
              <option value="">-- Select specialty --</option>
              <option value="Right Hand Batting">Right Hand Batting</option>
              <option value="Left Hand Batting">Left Hand Batting</option>
              <option value="Right Hand Bowler">Right Hand Bowler</option>
              <option value="Left Hand Bowler">Left Hand Bowler</option>
            </select>
          </div>
        )}

        {player.role === 'Bowler' && (
          <div className={styles.formGroup}>
            <label>Bowling type</label>
            <select
              value={player.bowlingType || ''}
              onChange={(e) => onChange('bowlingType', e.target.value)}
              style={selectStyle}
            >
              <option value="">-- Select bowling style --</option>
              <option value="Right Hand Fast">Right Hand Fast</option>
              <option value="Left Hand Fast">Left Hand Fast</option>
              <option value="Right Spinner">Right Spinner</option>
              <option value="Left Spinner">Left Spinner</option>
            </select>
          </div>
        )}
      </div>
    );
  };

  const renderCustomField = (field: CustomFieldDef) => {
    const rule = resolveCustomFieldValidation(field);
    const value = getCustomValue(player.customValues, field);
    const htmlType =
      field.type === 'select'
        ? 'text'
        : field.type === 'number' && (rule.kind === 'aadhaar' || rule.kind === 'phone' || rule.kind === 'pincode')
          ? 'text'
          : field.type === 'number'
            ? 'number'
            : rule.htmlType || 'text';

    return (
      <div key={field.id} className={styles.formGroup}>
        <label>
          {field.label} <FlagRequired required={field.required} />
        </label>
        {field.type === 'select' ? (
          <select
            value={value}
            required={field.required}
            onChange={(e) => onCustomChange(field.label, e.target.value)}
            style={selectStyle}
          >
            <option value="">-- Select {field.label} --</option>
            {(field.options || '').split(',').map((opt: string) => {
              const trimmed = opt.trim();
              return (
                <option key={trimmed} value={trimmed}>
                  {trimmed}
                </option>
              );
            })}
          </select>
        ) : (
          <>
            <input
              type={htmlType}
              inputMode={rule.inputMode}
              pattern={rule.pattern}
              minLength={rule.minLength}
              maxLength={rule.maxLength}
              title={rule.message}
              placeholder={
                rule.hint
                  ? `Enter ${String(field.label || '').toLowerCase()} (${rule.hint})`
                  : `Enter your ${String(field.label || '').toLowerCase()}`
              }
              required={field.required}
              value={value}
              onChange={(e) =>
                onCustomChange(field.label, sanitizeCustomFieldInput(field, e.target.value))
              }
            />
            {rule.hint ? <p className={styles.formFieldHint}>{rule.hint}</p> : null}
          </>
        )}
      </div>
    );
  };

  const combineDobAge =
    fieldKeys.includes('dob') &&
    fieldKeys.includes('age') &&
    config.dob?.enabled !== false &&
    config.age?.enabled !== false;
  const dobAgeAnchor = combineDobAge
    ? fieldKeys.find((k) => k === 'dob' || k === 'age')
    : null;

  const renderKey = (key: string) => {
    if (isCustomFieldOrderKey(key)) {
      const id = parseCustomFieldId(key);
      const field = customFields.find((f) => f.id === id);
      return field ? renderCustomField(field) : null;
    }

    if (key === 'cricketProfile') {
      return renderSportsProfile();
    }

    const flags = config[key];
    const fieldLabel = resolveStandardFieldLabel(key, config as Record<string, unknown>);

    switch (key) {
      case 'photo':
        return (
          <div key="photo" className={`${styles.formGroup} ${styles.photoUploadField}`}>
            <label>
              {fieldLabel}{' '}
              <FlagRequired required={flags?.required} />
            </label>
            <div className={styles.fileUploadRow}>
              {player.photo ? (
                <img
                  src={player.photo}
                  alt={variant === 'individual' ? 'Your photo preview' : 'Player photo preview'}
                  className={styles.photoPreview}
                />
              ) : (
                <div className={styles.photoPlaceholder} aria-hidden>
                  {variant === 'team' ? (
                    <User size={22} strokeWidth={2} />
                  ) : (
                    <ImageIcon size={22} strokeWidth={2} />
                  )}
                </div>
              )}
              <div className={styles.photoActions}>
                <input
                  ref={photoInputRef}
                  id={variant === 'team' ? `team-player-photo-${playerIndex}` : undefined}
                  type="file"
                  accept="image/*"
                  className={styles.fileInputHidden}
                  required={Boolean(flags?.required && !player.photo)}
                  onChange={onPhotoUpload}
                />
                <div className={styles.photoActionsMeta}>
                  <button
                    type="button"
                    className={styles.fileChooseBtn}
                    onClick={() => {
                      if (onPhotoChooseClick) onPhotoChooseClick();
                      else if (variant === 'team') {
                        document.getElementById(`team-player-photo-${playerIndex}`)?.click();
                      }
                    }}
                  >
                    {player.photo ? 'Change photo' : 'Upload photo'}
                  </button>
                  <span className={styles.fileNameHint} title={photoFileLabel || undefined}>
                    {variant === 'team'
                      ? player.photo
                        ? 'Photo ready'
                        : photoFileLabel || 'JPG or PNG, up to 5MB'
                      : photoFileLabel && photoFileLabel !== 'No file chosen'
                        ? photoFileLabel
                        : 'JPG or PNG, up to 5MB'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );

      case 'name':
        return (
          <div key="name" className={styles.formGroup}>
            <label>
              {fieldLabel}{' '}
              <span style={{ color: 'var(--error)' }}>*</span>
            </label>
            <input
              type="text"
              required
              placeholder={variant === 'team' ? 'Enter full name' : 'Enter your full name'}
              value={player.name || ''}
              onChange={(e) => onChange('name', e.target.value)}
            />
          </div>
        );

      case 'email':
        return (
          <div key="email" className={styles.formGroup}>
            <label>
              {fieldLabel} <FlagRequired required={flags?.required} />
            </label>
            <input
              type="email"
              required={flags?.required}
              placeholder="your.email@domain.com"
              value={player.email || ''}
              onChange={(e) => onChange('email', e.target.value)}
            />
          </div>
        );

      case 'phone':
        return (
          <div key="phone" className={styles.formGroup}>
            <label>
              {fieldLabel} <FlagRequired required={flags?.required} />
            </label>
            <input
              type="tel"
              pattern="[0-9]{10}"
              maxLength={10}
              minLength={10}
              required={flags?.required}
              placeholder="10-digit mobile (No +91 or 0)"
              value={player.phone || ''}
              onChange={(e) => onChange('phone', formatPhoneNumber(e.target.value))}
            />
          </div>
        );

      case 'emergencyContact':
        return (
          <div key="emergencyContact" className={styles.formGroup}>
            <label>
              {fieldLabel} <FlagRequired required={flags?.required} />
            </label>
            <input
              type="tel"
              pattern="[0-9]{10}"
              maxLength={10}
              minLength={10}
              required={flags?.required}
              placeholder="Emergency number (No +91 or 0)"
              value={player.emergencyContact || ''}
              onChange={(e) => onChange('emergencyContact', formatPhoneNumber(e.target.value))}
            />
          </div>
        );

      case 'dob':
        if (combineDobAge && key === dobAgeAnchor) {
          return (
            <AgeCategoryField
              key="dob-age"
              combined
              required={config.age?.required}
              dobRequired={config.dob?.required}
              dob={player.dob || ''}
              age={player.age || ''}
              categories={tournament?.ageCategories}
              selectedAgeCategoryId={selectedAgeCategoryId}
              onDobChange={(value) => onChange('dob', value)}
              dobLabel={resolveStandardFieldLabel('dob', config as Record<string, unknown>)}
              ageLabel={
                (typeof config.age?.label === 'string' && config.age.label.trim()) ||
                'Age & eligibility'
              }
            />
          );
        }
        if (combineDobAge) return null;
        return (
          <div key="dob" className={styles.formGroup}>
            <label>
              {fieldLabel} <FlagRequired required={flags?.required} />
            </label>
            <input
              type="date"
              required={flags?.required}
              value={player.dob || ''}
              onChange={(e) => onChange('dob', e.target.value)}
            />
            {selectedAgeCategoryId ? (
              <p className={styles.formFieldHint}>We&apos;ll verify this against your step 1 category.</p>
            ) : (
              <p className={styles.formFieldHint}>Used to calculate age and check eligibility.</p>
            )}
          </div>
        );

      case 'age': {
        if (combineDobAge) return null;
        return (
          <AgeCategoryField
            key="age"
            required={flags?.required}
            dob={player.dob || ''}
            age={player.age || ''}
            categories={tournament?.ageCategories}
            selectedAgeCategoryId={selectedAgeCategoryId}
            ageLabel={fieldLabel}
          />
        );
      }

      case 'aadhar':
        return (
          <div key="aadhar" className={styles.formGroup}>
            <label>
              {fieldLabel} <FlagRequired required={flags?.required} />
            </label>
            <input
              type="text"
              required={flags?.required}
              placeholder={variant === 'team' ? '12-digit Aadhaar' : '12-digit Aadhaar number'}
              value={player.aadhar || ''}
              onChange={(e) => onChange('aadhar', e.target.value)}
            />
          </div>
        );

      case 'gender':
        return (
          <div key="gender" className={styles.formGroup}>
            <label>
              {fieldLabel} <FlagRequired required={flags?.required} />
            </label>
            <select
              required={flags?.required}
              value={player.gender || ''}
              onChange={(e) => onChange('gender', e.target.value)}
              style={selectStyle}
            >
              <option value="">-- Select {fieldLabel} --</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>
        );

      case 'jerseyName':
        return (
          <div key="jerseyName" className={styles.formGroup}>
            <label>
              {fieldLabel} <FlagRequired required={flags?.required} />
            </label>
            <input
              type="text"
              required={flags?.required}
              placeholder={variant === 'team' ? 'Name on Jersey' : 'Name on jersey'}
              value={player.jerseyName || ''}
              onChange={(e) => onChange('jerseyName', e.target.value)}
            />
          </div>
        );

      case 'jerseyNumber':
        return (
          <div key="jerseyNumber" className={styles.formGroup}>
            <label>
              {fieldLabel} <FlagRequired required={flags?.required} />
            </label>
            <input
              type="number"
              required={flags?.required}
              placeholder="e.g. 10"
              min={0}
              max={999}
              value={player.jerseyNumber || ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || (Number(val) >= 0 && Number(val) <= 999)) {
                  onChange('jerseyNumber', val);
                }
              }}
            />
          </div>
        );

      case 'jerseySize':
        return (
          <div key="jerseySize" className={styles.formGroup}>
            <label>
              {fieldLabel} <FlagRequired required={flags?.required} />
            </label>
            <select
              required={flags?.required}
              value={player.jerseySize || ''}
              onChange={(e) => onChange('jerseySize', e.target.value)}
              style={selectStyle}
            >
              <option value="">-- Select Size --</option>
              {JERSEY_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <JerseySizeGuide selectedSize={player.jerseySize} />
          </div>
        );

      default:
        return null;
    }
  };

  return <>{fieldKeys.map((key) => renderKey(key))}</>;
}
