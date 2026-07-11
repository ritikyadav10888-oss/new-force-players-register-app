'use client';

import { useState, type ChangeEvent, type RefObject } from 'react';
import { ChevronDown, ChevronUp, Image as ImageIcon, Ruler, User } from 'lucide-react';
import {
  CRICKET_ROLES,
  cricketRolesNeedBattingHand,
  cricketRolesNeedBowling,
  normalizeBattingHandUi,
  parseCricketRoles,
} from '@/lib/cricket-roles';
import { FOOTBALL_ROLES } from '@/lib/football-roles';
import { isCustomFieldOrderKey, parseCustomFieldId } from '@/lib/form-config';
import {
  isCricketSport,
  isFootballSport,
  parseSportRoles,
} from '@/lib/sport-utils';
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

/** Size chart: size → code → width × length (inches). */
const JERSEY_SIZE_GUIDE: { size: string; code: string; measurement: string }[] = [
  { size: '1-2 Years', code: '22', measurement: '12 × 20' },
  { size: '3-4 Years', code: '24', measurement: '13 × 21' },
  { size: '5-6 Years', code: '26', measurement: '14 × 22' },
  { size: '7-8 Years', code: '28', measurement: '15 × 23' },
  { size: '9-10 Years', code: '30', measurement: '16 × 24' },
  { size: '11-12 Years', code: '32', measurement: '17 × 25' },
  { size: 'XXS', code: '34', measurement: '19 × 27' },
  { size: 'XS', code: '36', measurement: '20 × 28' },
  { size: 'S', code: '38', measurement: '21 × 29' },
  { size: 'M', code: '40', measurement: '22 × 30' },
  { size: 'L', code: '42', measurement: '23 × 31' },
  { size: 'XL', code: '44', measurement: '24 × 33' },
  { size: '2XL', code: '46', measurement: '25 × 34' },
  { size: '3XL', code: '48', measurement: '26 × 35' },
  { size: '4XL', code: '50', measurement: '27 × 36' },
  { size: '5XL', code: '52', measurement: '28 × 37' },
  { size: '6XL', code: '54', measurement: '29 × 38' },
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
            Measurements are chest width × length (inches). Pick the size closest to your fit.
          </p>
          <div className={styles.jerseySizeGuideTableWrap}>
            <table className={styles.jerseySizeGuideTable}>
              <thead>
                <tr>
                  <th>Size</th>
                  <th>Code</th>
                  <th>Width × Length</th>
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
  customValues?: Record<string, string>;
};

type FieldFlags = { enabled?: boolean; required?: boolean };

type Props = {
  fieldKeys: string[];
  player: OrderedPlayerValues;
  config: Record<string, FieldFlags | undefined>;
  tournament: { sport?: string; customFields?: any[] };
  onChange: (key: string, value: string) => void;
  onCustomChange: (label: string, value: string) => void;
  onSportRoleToggle: (role: string) => void;
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

type AgeCategory = 'Kids' | 'Teens' | 'Men';

function resolveAgeCategory(dob: string): AgeCategory | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const y = birth.getFullYear();
  const m = birth.getMonth();
  const d = birth.getDate();
  // Kids: born after 8 Aug 2015
  // Teens: 9 Aug 2010 – 8 Aug 2015
  // Men: before 9 Aug 2010
  const afterAug8_2015 = y > 2015 || (y === 2015 && (m > 7 || (m === 7 && d > 8)));
  const beforeAug9_2010 = y < 2010 || (y === 2010 && (m < 7 || (m === 7 && d < 9)));
  if (afterAug8_2015) return 'Kids';
  if (beforeAug9_2010) return 'Men';
  return 'Teens';
}

const AGE_CATEGORIES = [
  {
    id: 'Kids' as const,
    title: 'Kids',
    range: 'Below 11 yrs',
    detail: 'Born after 8th Aug 2015',
  },
  {
    id: 'Teens' as const,
    title: 'Teens',
    range: '11–16 yrs',
    detail: '9th Aug 2010 – 8th Aug 2015',
  },
  {
    id: 'Men' as const,
    title: 'Men',
    range: '16 yrs & above',
    detail: 'Before 9th Aug 2010',
  },
];

function AgeCategoryField({
  required,
  dob,
  age,
}: {
  required?: boolean;
  dob: string;
  age: string;
}) {
  const ageCategory = resolveAgeCategory(dob);
  const [showCategories, setShowCategories] = useState(false);

  return (
    <div className={styles.ageFieldWrap}>
      <div className={styles.formGroup}>
        <label>
          Age <FlagRequired required={required} />
        </label>
        <div className={styles.ageInputRow}>
          <input
            type="number"
            required={required}
            readOnly
            tabIndex={-1}
            placeholder={dob ? '' : 'From DOB'}
            value={age || ''}
            aria-readonly="true"
            title="Age is calculated from date of birth"
            className={styles.ageInput}
          />
          {ageCategory ? (
            <span
              className={[
                styles.ageCategoryPill,
                ageCategory === 'Kids'
                  ? styles.agePillKids
                  : ageCategory === 'Teens'
                    ? styles.agePillTeens
                    : styles.agePillMen,
              ].join(' ')}
            >
              {ageCategory}
            </span>
          ) : (
            <span className={styles.ageCategoryPillMuted}>Select DOB</span>
          )}
        </div>
        <button
          type="button"
          className={styles.ageCategoryToggle}
          aria-expanded={showCategories}
          onClick={() => setShowCategories((v) => !v)}
        >
          {showCategories ? 'Hide age categories' : 'View age categories'}
          {showCategories ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {showCategories ? (
        <div className={styles.ageCategoryGuide} role="note" aria-label="Age categories">
          {AGE_CATEGORIES.map((cat) => {
            const active = ageCategory === cat.id;
            const cardTone =
              cat.id === 'Kids'
                ? styles.ageCardKids
                : cat.id === 'Teens'
                  ? styles.ageCardTeens
                  : styles.ageCardMen;
            return (
              <div
                key={cat.id}
                className={[
                  styles.ageCategoryCard,
                  cardTone,
                  active ? styles.ageCategoryCardActive : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className={styles.ageCategoryCardTop}>
                  <span className={styles.ageCategoryCardTitle}>{cat.title}</span>
                  <span className={styles.ageCategoryCardRange}>{cat.range}</span>
                </div>
                <p className={styles.ageCategoryCardDetail}>{cat.detail}</p>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function OrderedPlayerFields({
  fieldKeys,
  player,
  config,
  tournament,
  onChange,
  onCustomChange,
  onSportRoleToggle,
  formatPhoneNumber,
  variant,
  playerIndex = 0,
  photoFileLabel,
  onPhotoUpload,
  photoInputRef,
  onPhotoChooseClick,
}: Props) {
  const customFields: any[] = tournament.customFields || [];

  const renderSportsProfile = () => {
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
                    {player.bowlingType === opt ? <span className={styles.bowlingChipMark}>✓</span> : null}
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

    // Other sports — unstructured role UI
    return (
      <div key="cricketProfile" style={variant === 'individual' ? { display: 'contents' } : undefined}>
        <div
          className={styles.formGroup}
          style={variant === 'individual' ? { gridColumn: '1 / -1' } : undefined}
        >
          <label>
            Playing role <FlagRequired required={config.cricketProfile?.required} />
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
              <option value="Batting All-rounder">Batting all-rounder</option>
              <option value="Bowling All-rounder">Bowling all-rounder</option>
              <option value="Right Hand">Right Hand</option>
              <option value="Left Hand Fast">Left Hand Fast</option>
              <option value="Spinner">Spinner</option>
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

  const renderCustomField = (field: any) => (
    <div key={field.id} className={styles.formGroup}>
      <label>
        {field.label} <FlagRequired required={field.required} />
      </label>
      {field.type === 'select' ? (
        <select
          value={player.customValues?.[field.label] || ''}
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
        <input
          type={field.type === 'number' ? 'number' : 'text'}
          placeholder={`Enter your ${String(field.label || '').toLowerCase()}`}
          required={field.required}
          value={player.customValues?.[field.label] || ''}
          onChange={(e) => onCustomChange(field.label, e.target.value)}
        />
      )}
    </div>
  );

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

    switch (key) {
      case 'photo':
        return (
          <div
            key="photo"
            className={`${styles.formGroup} ${variant === 'team' ? styles.photoUploadField : ''}`}
            style={variant === 'individual' ? { gridColumn: '1 / -1' } : undefined}
          >
            <label>
              {variant === 'team' ? 'Player Photo' : 'Your photo'} <FlagRequired required={flags?.required} />
            </label>
            <div className={styles.fileUploadRow}>
              {player.photo ? (
                <img
                  src={player.photo}
                  alt={variant === 'individual' ? 'Preview' : ''}
                  className={variant === 'team' ? styles.photoPreview : undefined}
                  style={
                    variant === 'individual'
                      ? {
                          width: '60px',
                          height: '60px',
                          borderRadius: '50%',
                          objectFit: 'cover',
                          border: '2px solid var(--primary)',
                        }
                      : undefined
                  }
                />
              ) : variant === 'team' ? (
                <div className={styles.photoPlaceholder}>
                  <User size={22} strokeWidth={2} />
                </div>
              ) : (
                <div
                  style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ImageIcon size={24} color="#64748b" />
                </div>
              )}
              <input
                ref={photoInputRef}
                id={variant === 'team' ? `team-player-photo-${playerIndex}` : undefined}
                type="file"
                accept="image/*"
                className={styles.fileInputHidden}
                required={Boolean(flags?.required && !player.photo)}
                onChange={onPhotoUpload}
              />
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
                {variant === 'team'
                  ? player.photo
                    ? 'Change photo'
                    : 'Choose file'
                  : 'Choose file'}
              </button>
              <span className={styles.fileNameHint}>
                {variant === 'team'
                  ? player.photo
                    ? 'Photo ready'
                    : photoFileLabel || 'No file chosen'
                  : photoFileLabel}
              </span>
            </div>
          </div>
        );

      case 'name':
        return (
          <div key="name" className={styles.formGroup}>
            <label>
              {variant === 'team' ? 'Full Name' : 'Full name'}{' '}
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
              {variant === 'team' ? 'Email' : 'Email address'} <FlagRequired required={flags?.required} />
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
              {variant === 'team' ? 'Phone Number' : 'Phone number'} <FlagRequired required={flags?.required} />
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
              Emergency Contact <FlagRequired required={flags?.required} />
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
        return (
          <div key="dob" className={styles.formGroup}>
            <label>
              Date of Birth <FlagRequired required={flags?.required} />
            </label>
            <input
              type="date"
              required={flags?.required}
              value={player.dob || ''}
              onChange={(e) => onChange('dob', e.target.value)}
            />
          </div>
        );

      case 'age': {
        return (
          <AgeCategoryField
            key="age"
            required={flags?.required}
            dob={player.dob || ''}
            age={player.age || ''}
          />
        );
      }

      case 'aadhar':
        return (
          <div key="aadhar" className={styles.formGroup}>
            <label>
              Aadhar Number <FlagRequired required={flags?.required} />
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
              Gender <FlagRequired required={flags?.required} />
            </label>
            <select
              required={flags?.required}
              value={player.gender || ''}
              onChange={(e) => onChange('gender', e.target.value)}
              style={selectStyle}
            >
              <option value="">-- Select Gender --</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>
        );

      case 'jerseyName':
        return (
          <div key="jerseyName" className={styles.formGroup}>
            <label>
              Jersey Name <FlagRequired required={flags?.required} />
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
              Jersey Number <FlagRequired required={flags?.required} />
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
          <div key="jerseySize" className={styles.formGroup} style={{ gridColumn: '1 / -1' }}>
            <label>
              Jersey Size <FlagRequired required={flags?.required} />
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
