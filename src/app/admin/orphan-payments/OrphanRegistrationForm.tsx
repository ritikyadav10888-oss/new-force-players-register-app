'use client';

import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  OrderedPlayerFields,
  type OrderedPlayerValues,
} from '@/app/register/[slug]/OrderedPlayerFields';
import registerStyles from '@/app/register/[slug]/register.module.css';
import {
  isSportsProfileShown,
  resolveSportsProfileForTournament,
  visibleFieldOrder,
} from '@/lib/form-config';
import { isCricketSport, parseSportRoles, toggleSportRoleString } from '@/lib/sport-utils';
import {
  cricketRolesNeedBattingHand,
  cricketRolesNeedBowling,
  allRounderTypeForCricketPayload,
} from '@/lib/cricket-roles';

export type OrphanTournamentMeta = {
  type: string;
  sport: string;
  formConfig: Record<string, unknown>;
  customFields: Array<{ id: string; label: string; type?: string; options?: string; required?: boolean }>;
  minPlayers?: number;
  maxPlayers?: number;
};

type Props = {
  tournamentId: string;
  tournament: OrphanTournamentMeta | null;
  pendingPrefill: Record<string, unknown> | null;
  busy: boolean;
  onSubmit: (payload: Record<string, unknown>) => void;
  /** Override primary button label (e.g. public claim form). */
  submitLabel?: string;
};

const DEFAULT_FORM_CONFIG = {
  email: { enabled: true, required: false },
  phone: { enabled: true, required: true },
  emergencyContact: { enabled: false, required: false },
  dob: { enabled: true, required: true },
  age: { enabled: true, required: false },
  gender: { enabled: true, required: false },
  jerseyName: { enabled: true, required: false },
  jerseyNumber: { enabled: true, required: false },
  jerseySize: { enabled: true, required: false },
  photo: { enabled: true, required: false },
  aadhar: { enabled: false, required: false },
  cricketProfile: { enabled: true, required: false },
};

function emptyPlayer(): OrderedPlayerValues {
  return {
    name: '',
    email: '',
    phone: '',
    emergencyContact: '',
    dob: '',
    age: '',
    gender: '',
    aadhar: '',
    jerseyName: '',
    jerseyNumber: '',
    jerseySize: '',
    photo: '',
    role: '',
    battingHand: '',
    bowlingType: '',
    allRounderType: '',
    customValues: {},
  };
}

function calculateAge(dobString: string) {
  if (!dobString) return '';
  const today = new Date();
  const birthDate = new Date(dobString);
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age >= 0 ? age.toString() : '';
}

function compressImage(file: File, callback: (base64: string) => void) {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = (event) => {
    const img = new window.Image();
    img.src = event.target?.result as string;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX = 800;
      let { width, height } = img;
      if (width > height) {
        if (width > MAX) {
          height *= MAX / width;
          width = MAX;
        }
      } else if (height > MAX) {
        width *= MAX / height;
        height = MAX;
      }
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
      callback(canvas.toDataURL('image/jpeg', 0.7));
    };
  };
}

function formatPhoneNumber(value: string) {
  let cleaned = value.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+91')) cleaned = cleaned.slice(3);
  if (cleaned.startsWith('0')) cleaned = cleaned.slice(1);
  return cleaned.replace(/\D/g, '').slice(0, 10);
}

function mapPlayerFromPayload(p: Record<string, unknown>): OrderedPlayerValues {
  const dob = typeof p.dob === 'string' ? p.dob : '';
  return {
    name: typeof p.name === 'string' ? p.name : '',
    email: typeof p.email === 'string' ? p.email : '',
    phone: typeof p.phone === 'string' ? p.phone : '',
    emergencyContact: typeof p.emergencyContact === 'string' ? p.emergencyContact : '',
    dob,
    age: p.age != null ? String(p.age) : calculateAge(dob),
    gender: typeof p.gender === 'string' ? p.gender : '',
    aadhar: typeof p.aadhar === 'string' ? p.aadhar : '',
    jerseyName: typeof p.jerseyName === 'string' ? p.jerseyName : '',
    jerseyNumber: p.jerseyNumber != null ? String(p.jerseyNumber) : '',
    jerseySize: typeof p.jerseySize === 'string' ? p.jerseySize : '',
    photo: typeof p.photo === 'string' ? p.photo : '',
    role: typeof p.role === 'string' ? p.role : '',
    battingHand: typeof p.battingHand === 'string' ? p.battingHand : '',
    bowlingType: typeof p.bowlingType === 'string' ? p.bowlingType : '',
    allRounderType: typeof p.allRounderType === 'string' ? p.allRounderType : '',
    customValues:
      p.customValues && typeof p.customValues === 'object' && !Array.isArray(p.customValues)
        ? (p.customValues as Record<string, string>)
        : {},
  };
}

export function OrphanRegistrationForm({
  tournamentId,
  tournament,
  pendingPrefill,
  busy,
  onSubmit,
  submitLabel = 'Save registration',
}: Props) {
  const isTeam = tournament?.type === 'Team';

  const config = useMemo(() => {
    const raw = tournament?.formConfig || {};
    return {
      ...DEFAULT_FORM_CONFIG,
      ...raw,
      cricketProfile: resolveSportsProfileForTournament(raw, tournament?.sport),
    };
  }, [tournament]);

  const fieldsConfig = useMemo(() => {
    const { fieldOrder: _fieldOrder, ...rest } = config as typeof config & {
      fieldOrder?: unknown;
    };
    return rest;
  }, [config]);

  const orderedFieldKeys = useMemo(
    () =>
      visibleFieldOrder(
        config as Record<string, unknown>,
        tournament?.customFields || [],
        isSportsProfileShown(config.cricketProfile)
      ),
    [config, tournament?.customFields]
  );

  const tournamentView = useMemo(
    () => ({
      sport: tournament?.sport || 'Cricket',
      customFields: tournament?.customFields || [],
    }),
    [tournament]
  );

  const [teamName, setTeamName] = useState('');
  const [representative, setRepresentative] = useState('');
  const [contact, setContact] = useState('');
  const [teamPlayers, setTeamPlayers] = useState<OrderedPlayerValues[]>([emptyPlayer()]);
  const [individualPlayer, setIndividualPlayer] = useState<OrderedPlayerValues>(emptyPlayer());
  const [photoLabels, setPhotoLabels] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!pendingPrefill) return;
    const pf = pendingPrefill;
    if (typeof pf.teamName === 'string') setTeamName(pf.teamName);
    if (typeof pf.representative === 'string') setRepresentative(pf.representative);
    if (typeof pf.contact === 'string') setContact(pf.contact);
    if (Array.isArray(pf.players) && pf.players.length > 0) {
      const mapped = pf.players.map((p) =>
        mapPlayerFromPayload(p as Record<string, unknown>)
      );
      if (isTeam) setTeamPlayers(mapped);
      else setIndividualPlayer(mapped[0] || emptyPlayer());
    }
  }, [pendingPrefill, isTeam]);

  const handleTeamPlayerChange = (index: number, field: string, value: string) => {
    if (field === 'age') return;
    setTeamPlayers((prev) => {
      const next = [...prev];
      const updated = {
        ...next[index],
        ...(field === 'role' ? { battingHand: '', bowlingType: '', allRounderType: '' } : {}),
        [field]: value,
      };
      if (field === 'dob') updated.age = calculateAge(value);
      next[index] = updated;
      return next;
    });
  };

  const handleIndividualChange = (field: string, value: string) => {
    if (field === 'age') return;
    setIndividualPlayer((prev) => {
      const updated = {
        ...prev,
        ...(field === 'role' ? { battingHand: '', bowlingType: '', allRounderType: '' } : {}),
        [field]: value,
      };
      if (field === 'dob') updated.age = calculateAge(value);
      return updated;
    });
  };

  const handleTeamCustom = (index: number, label: string, value: string) => {
    setTeamPlayers((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        customValues: { ...(next[index].customValues || {}), [label]: value },
      };
      return next;
    });
  };

  const handleIndividualCustom = (label: string, value: string) => {
    setIndividualPlayer((prev) => ({
      ...prev,
      customValues: { ...(prev.customValues || {}), [label]: value },
    }));
  };

  const handleSportToggle = (index: number | null, role: string) => {
    const apply = (prev: OrderedPlayerValues) => {
      const nextRole = toggleSportRoleString(tournament?.sport, prev.role || '', role);
      const rolesArr = parseSportRoles(tournament?.sport, nextRole);
      const needBat = isCricketSport(tournamentView) && cricketRolesNeedBattingHand(rolesArr);
      const needBowl = isCricketSport(tournamentView) && cricketRolesNeedBowling(rolesArr);
      return {
        ...prev,
        role: nextRole,
        battingHand: needBat ? prev.battingHand : '',
        bowlingType: needBowl ? prev.bowlingType : '',
        allRounderType: '',
      };
    };
    if (index === null) setIndividualPlayer((p) => apply(p));
    else setTeamPlayers((prev) => prev.map((p, i) => (i === index ? apply(p) : p)));
  };

  const handlePhoto = (e: ChangeEvent<HTMLInputElement>, teamIdx?: number) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('File size exceeds 5MB.');
      e.target.value = '';
      return;
    }
    compressImage(file, (dataUrl) => {
      if (teamIdx !== undefined) {
        handleTeamPlayerChange(teamIdx, 'photo', dataUrl);
        setPhotoLabels((prev) => ({ ...prev, [teamIdx]: file.name }));
      } else {
        handleIndividualChange('photo', dataUrl);
      }
    });
  };

  const mapPlayerToPayload = (p: OrderedPlayerValues) => ({
    name: p.name,
    email: p.email,
    phone: p.phone,
    emergencyContact: p.emergencyContact,
    dob: p.dob,
    age: p.age ? Number(p.age) : null,
    gender: p.gender,
    aadhar: p.aadhar,
    jerseyName: p.jerseyName,
    jerseyNumber: p.jerseyNumber ? Number(p.jerseyNumber) : null,
    jerseySize: p.jerseySize,
    photo: p.photo,
    role: p.role,
    battingHand: p.battingHand,
    bowlingType: p.bowlingType,
    allRounderType: allRounderTypeForCricketPayload(
      isCricketSport(tournamentView),
      p.role,
      p.battingHand,
      p.bowlingType,
      p.allRounderType
    ),
    customValues: p.customValues || {},
  });

  const handleSave = () => {
    const players = isTeam
      ? teamPlayers.filter((p) => p.name?.trim())
      : [individualPlayer];

    if (players.length === 0 || !players[0].name?.trim()) {
      alert('Player name is required.');
      return;
    }

    if (config.photo?.enabled && config.photo?.required) {
      const missing = players.findIndex((p) => !(p.photo || '').trim());
      if (missing !== -1) {
        alert(`Photo is required for player ${missing + 1}.`);
        return;
      }
    }

    const first = players[0];
    onSubmit({
      tournamentId,
      teamName: isTeam ? teamName.trim() || first.name : first.name,
      representative: isTeam ? representative.trim() || first.name : first.name,
      contact: isTeam ? contact.trim() || first.phone || '' : first.phone || '',
      teamLogoUrl: null,
      players: players.map(mapPlayerToPayload),
    });
  };

  if (!tournament) {
    return (
      <p style={{ color: '#f87171', fontSize: '0.85rem' }}>
        Tournament config could not be loaded. Refresh and try again.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      {isTeam && (
        <div
          className={registerStyles.formGrid}
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
        >
          <label className={registerStyles.formGroup}>
            <span>Team name *</span>
            <input value={teamName} onChange={(e) => setTeamName(e.target.value)} />
          </label>
          <label className={registerStyles.formGroup}>
            <span>Representative *</span>
            <input value={representative} onChange={(e) => setRepresentative(e.target.value)} />
          </label>
          <label className={registerStyles.formGroup}>
            <span>Contact phone *</span>
            <input
              value={contact}
              onChange={(e) => setContact(formatPhoneNumber(e.target.value))}
            />
          </label>
        </div>
      )}

      {isTeam ? (
        teamPlayers.map((player, idx) => (
          <div
            key={idx}
            style={{
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '0.6rem',
              padding: '0.85rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
              <strong style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>Player {idx + 1}</strong>
              {teamPlayers.length > 1 && (
                <button
                  type="button"
                  onClick={() => setTeamPlayers((prev) => prev.filter((_, i) => i !== idx))}
                  style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}
                >
                  Remove
                </button>
              )}
            </div>
            <div className={registerStyles.formGrid}>
              <OrderedPlayerFields
                fieldKeys={orderedFieldKeys}
                player={player}
                config={fieldsConfig}
                tournament={tournamentView}
                variant="team"
                playerIndex={idx}
                photoFileLabel={photoLabels[idx]}
                formatPhoneNumber={formatPhoneNumber}
                onChange={(key, value) => handleTeamPlayerChange(idx, key, value)}
                onCustomChange={(label, value) => handleTeamCustom(idx, label, value)}
                onSportRoleToggle={(role) => handleSportToggle(idx, role)}
                onPhotoUpload={(e) => handlePhoto(e, idx)}
              />
            </div>
          </div>
        ))
      ) : (
        <div
          style={{
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '0.6rem',
            padding: '0.85rem',
          }}
        >
          <div className={registerStyles.formGrid}>
            <OrderedPlayerFields
              fieldKeys={orderedFieldKeys}
              player={individualPlayer}
              config={fieldsConfig}
              tournament={tournamentView}
              variant="individual"
              formatPhoneNumber={formatPhoneNumber}
              onChange={handleIndividualChange}
              onCustomChange={handleIndividualCustom}
              onSportRoleToggle={(role) => handleSportToggle(null, role)}
              onPhotoUpload={(e) => handlePhoto(e)}
            />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        {isTeam && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setTeamPlayers((prev) => [...prev, emptyPlayer()])}
            style={{ fontSize: '0.85rem' }}
          >
            + Add player
          </button>
        )}
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          onClick={handleSave}
          style={{ fontSize: '0.85rem' }}
        >
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </div>
  );
}
