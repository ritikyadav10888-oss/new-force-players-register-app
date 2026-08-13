'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { adminFetch } from '@/lib/auth/admin-client';
import {
  customFieldOrderKey,
  fieldOrderLabel,
  isCustomFieldOrderKey,
  parseCustomFieldId,
  resolveSportsProfileForTournament,
  visibleFieldOrder,
} from '@/lib/form-config';
import { parseCustomFields, type CustomFieldDef } from '@/lib/custom-fields';
import styles from './adminTeamLinkPlayerEditor.module.css';

export type AdminRosterPlayer = {
  id?: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  emergencyContact?: string | null;
  dob?: string | null;
  age?: string | number | null;
  ageCategory?: string | null;
  gender?: string | null;
  aadhar?: string | null;
  jerseyName?: string | null;
  jerseyNumber?: string | number | null;
  jerseySize?: string | null;
  role?: string | null;
  battingHand?: string | null;
  bowlingType?: string | null;
  allRounderType?: string | null;
  photo?: string | null;
  customValues?: Record<string, string>;
};

type StandardForm = {
  name: string;
  phone: string;
  email: string;
  dob: string;
  age: string;
  role: string;
  gender: string;
  aadhar: string;
  jerseyName: string;
  jerseyNumber: string;
  jerseySize: string;
  emergencyContact: string;
  battingHand: string;
  bowlingType: string;
  allRounderType: string;
  photo: string;
};

const emptyStandard = (): StandardForm => ({
  name: '',
  phone: '',
  email: '',
  dob: '',
  age: '',
  role: '',
  gender: '',
  aadhar: '',
  jerseyName: '',
  jerseyNumber: '',
  jerseySize: '',
  emergencyContact: '',
  battingHand: '',
  bowlingType: '',
  allRounderType: '',
  photo: '',
});

function toStandard(p?: AdminRosterPlayer | null): StandardForm {
  if (!p) return emptyStandard();
  return {
    name: String(p.name || ''),
    phone: String(p.phone || ''),
    email: String(p.email || ''),
    dob: String(p.dob || ''),
    age: p.age != null ? String(p.age) : '',
    role: String(p.role || ''),
    gender: String(p.gender || ''),
    aadhar: String(p.aadhar || ''),
    jerseyName: String(p.jerseyName || ''),
    jerseyNumber: p.jerseyNumber != null ? String(p.jerseyNumber) : '',
    jerseySize: String(p.jerseySize || ''),
    emergencyContact: String(p.emergencyContact || ''),
    battingHand: String(p.battingHand || ''),
    bowlingType: String(p.bowlingType || ''),
    allRounderType: String(p.allRounderType || ''),
    photo: typeof p.photo === 'string' && p.photo.startsWith('data:') ? p.photo : '',
  };
}

const STANDARD_INPUT: Record<
  string,
  { key: keyof StandardForm; type: string; fullWidth?: boolean }
> = {
  name: { key: 'name', type: 'text', fullWidth: true },
  phone: { key: 'phone', type: 'tel' },
  email: { key: 'email', type: 'email' },
  dob: { key: 'dob', type: 'date' },
  age: { key: 'age', type: 'text' },
  emergencyContact: { key: 'emergencyContact', type: 'tel' },
  aadhar: { key: 'aadhar', type: 'text' },
  gender: { key: 'gender', type: 'text' },
  jerseyName: { key: 'jerseyName', type: 'text' },
  jerseyNumber: { key: 'jerseyNumber', type: 'text' },
  jerseySize: { key: 'jerseySize', type: 'text' },
};

type Mode =
  | { kind: 'registration'; registrationId: string }
  | { kind: 'invite'; inviteId: string };

type Props = {
  mode: Mode;
  onChanged: () => void | Promise<void>;
  player?: AdminRosterPlayer;
  addButton?: boolean;
  addLabel?: string;
  disabled?: boolean;
  /** Tournament form_config — drives which fields appear. */
  formConfig?: Record<string, unknown> | null;
  customFields?: CustomFieldDef[] | unknown;
  /** Team-level fields (e.g. Society Name) shown in the same admin form. */
  teamCustomFields?: CustomFieldDef[] | unknown;
  teamCustomValues?: Record<string, string> | null;
  /** Called when team custom values are saved (invite or registration). */
  onTeamCustomValuesChange?: (values: Record<string, string>) => void | Promise<void>;
  sport?: string | null;
};

export function AdminTeamLinkPlayerActions({
  mode,
  onChanged,
  player,
  addButton = false,
  addLabel = 'Add player',
  disabled = false,
  formConfig = null,
  customFields: customFieldsRaw,
  teamCustomFields: teamCustomFieldsRaw,
  teamCustomValues: teamCustomValuesProp = null,
  onTeamCustomValuesChange,
  sport = null,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [form, setForm] = useState<StandardForm>(emptyStandard());
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [teamValues, setTeamValues] = useState<Record<string, string>>({});
  const editing = Boolean(player?.id) && !addButton;

  const customFields = useMemo(() => parseCustomFields(customFieldsRaw), [customFieldsRaw]);
  const teamCustomFields = useMemo(
    () => parseCustomFields(teamCustomFieldsRaw),
    [teamCustomFieldsRaw]
  );

  const config = useMemo(() => {
    const fc = formConfig && typeof formConfig === 'object' ? { ...formConfig } : {};
    return {
      ...fc,
      cricketProfile: resolveSportsProfileForTournament(fc, sport),
    };
  }, [formConfig, sport]);

  const fieldKeys = useMemo(() => {
    const sportsProfileShown = Boolean(
      config.cricketProfile?.enabled || config.cricketProfile?.required
    );
    const keys = [...visibleFieldOrder(config, customFields, sportsProfileShown)];

    const ensure = (key: string, after?: string) => {
      if (keys.includes(key)) return;
      if (after && keys.includes(after)) {
        keys.splice(keys.indexOf(after) + 1, 0, key);
      } else {
        keys.push(key);
      }
    };

    // Admin roster edit: always show Aadhaar so saved values are visible/editable.
    ensure('aadhar', 'age');

    // Include every defined player custom field
    for (const f of customFields) {
      ensure(customFieldOrderKey(f.id));
    }

    if (keys.length <= 1) {
      return [
        'name',
        'phone',
        'email',
        'dob',
        'age',
        'aadhar',
        'gender',
        'jerseyName',
        'jerseyNumber',
        'jerseySize',
        'emergencyContact',
        ...customFields.map((f) => customFieldOrderKey(f.id)),
      ];
    }
    return keys;
  }, [config, customFields, player?.aadhar]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setForm(toStandard(addButton ? null : player));
    setCustomValues(
      addButton
        ? {}
        : player?.customValues && typeof player.customValues === 'object'
          ? { ...player.customValues }
          : {}
    );
    setTeamValues(
      teamCustomValuesProp && typeof teamCustomValuesProp === 'object'
        ? { ...teamCustomValuesProp }
        : {}
    );
  }, [open, player, addButton, teamCustomValuesProp]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const close = () => {
    if (busy) return;
    setOpen(false);
  };

  const setStandard = (key: keyof StandardForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    const name = form.name.trim();
    if (!name) {
      toast.error('Player name is required.');
      return;
    }

    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        name,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        dob: form.dob.trim() || null,
        age: form.age.trim() || null,
        role: form.role.trim() || null,
        gender: form.gender.trim() || null,
        aadhar: form.aadhar.trim() || null,
        jerseyName: form.jerseyName.trim() || null,
        jerseyNumber: form.jerseyNumber.trim() || null,
        jerseySize: form.jerseySize.trim() || null,
        emergencyContact: form.emergencyContact.trim() || null,
        battingHand: form.battingHand.trim() || null,
        bowlingType: form.bowlingType.trim() || null,
        allRounderType: form.allRounderType.trim() || null,
        customValues,
      };
      if (form.photo.startsWith('data:image/')) {
        payload.photo = form.photo;
      }

      let res: Response;
      if (editing && player?.id) {
        const url =
          mode.kind === 'registration'
            ? `/api/admin/registrations/${mode.registrationId}/team-link-players/${player.id}`
            : `/api/admin/team-invites/${mode.inviteId}/players/${player.id}`;
        res = await adminFetch(url, { method: 'PATCH', body: JSON.stringify({ player: payload }) });
      } else {
        const url =
          mode.kind === 'registration'
            ? `/api/admin/registrations/${mode.registrationId}/team-link-players`
            : `/api/admin/team-invites/${mode.inviteId}/players`;
        res = await adminFetch(url, { method: 'POST', body: JSON.stringify({ player: payload }) });
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Request failed');

      if (teamCustomFields.length > 0) {
        if (onTeamCustomValuesChange) {
          await onTeamCustomValuesChange(teamValues);
        } else if (mode.kind === 'invite') {
          const teamRes = await adminFetch(`/api/admin/team-invites/${mode.inviteId}`, {
            method: 'PATCH',
            body: JSON.stringify({ teamCustomValues: teamValues }),
          });
          const teamJson = await teamRes.json().catch(() => ({}));
          if (!teamRes.ok) throw new Error(teamJson?.error || 'Failed to save team fields');
        } else if (mode.kind === 'registration') {
          const teamRes = await adminFetch(
            `/api/admin/registrations/${mode.registrationId}/team-meta`,
            {
              method: 'PATCH',
              body: JSON.stringify({ teamCustomValues: teamValues }),
            }
          );
          const teamJson = await teamRes.json().catch(() => ({}));
          if (!teamRes.ok) throw new Error(teamJson?.error || 'Failed to save team fields');
        }
      }

      toast.success(editing ? 'Player updated' : 'Player added');
      setOpen(false);
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save player');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!player?.id) return;
    if (!confirm(`Remove ${player.name || 'this player'} from the team roster?`)) return;

    setBusy(true);
    try {
      const url =
        mode.kind === 'registration'
          ? `/api/admin/registrations/${mode.registrationId}/team-link-players/${player.id}`
          : `/api/admin/team-invites/${mode.inviteId}/players/${player.id}`;
      const res = await adminFetch(url, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to remove player');
      toast.success('Player removed');
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove player');
    } finally {
      setBusy(false);
    }
  };

  const onPhotoPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Photo must be under 5MB.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setStandard('photo', reader.result);
    };
    reader.readAsDataURL(file);
  };

  const renderField = (key: string) => {
    if (key === 'photo') {
      return (
        <label key={key} className={`${styles.field} ${styles.fullWidth}`}>
          <span>{fieldOrderLabel(key, customFields)}</span>
          <input type="file" accept="image/*" onChange={onPhotoPick} disabled={busy} />
          {form.photo ? <span className={styles.photoHint}>Photo selected</span> : null}
        </label>
      );
    }

    if (key === 'cricketProfile') {
      return (
        <div key={key} className={`${styles.profileBlock} ${styles.fullWidth}`}>
          <p className={styles.profileTitle}>{fieldOrderLabel(key, customFields)}</p>
          <div className={styles.grid}>
            {(
              [
                ['role', 'Role / position'],
                ['battingHand', 'Batting hand'],
                ['bowlingType', 'Bowling type'],
                ['allRounderType', 'All-rounder type'],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className={styles.field}>
                <span>{label}</span>
                <input
                  type="text"
                  value={form[k]}
                  onChange={(e) => setStandard(k, e.target.value)}
                  disabled={busy}
                />
              </label>
            ))}
          </div>
        </div>
      );
    }

    if (isCustomFieldOrderKey(key)) {
      const id = parseCustomFieldId(key);
      const def = customFields.find((f) => f.id === id);
      if (!def) return null;
      const label = def.label || 'Custom field';
      const value = customValues[label] || customValues[def.id] || '';
      const setCustom = (next: string) => {
        setCustomValues((prev) => ({ ...prev, [label]: next }));
      };

      if (def.type === 'select' || def.type === 'radio') {
        const options = String(def.options || '')
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean);
        if (options.length > 0) {
          return (
            <label key={key} className={styles.field}>
              <span>
                {label}
                {def.required ? ' *' : ''}
              </span>
              <select value={value} onChange={(e) => setCustom(e.target.value)} disabled={busy}>
                <option value="">Select…</option>
                {options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
          );
        }
      }

      return (
        <label key={key} className={styles.field}>
          <span>
            {label}
            {def.required ? ' *' : ''}
          </span>
          {def.type === 'textarea' ? (
            <textarea
              value={value}
              onChange={(e) => setCustom(e.target.value)}
              disabled={busy}
              rows={3}
            />
          ) : (
            <input
              type={def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : def.type === 'email' ? 'email' : def.type === 'phone' ? 'tel' : 'text'}
              value={value}
              onChange={(e) => setCustom(e.target.value)}
              disabled={busy}
            />
          )}
        </label>
      );
    }

    const meta = STANDARD_INPUT[key];
    if (!meta) return null;
    return (
      <label key={key} className={`${styles.field} ${meta.fullWidth ? styles.fullWidth : ''}`}>
        <span>
          {fieldOrderLabel(key, customFields)}
          {key === 'name' ? ' *' : ''}
        </span>
        <input
          type={meta.type}
          value={form[meta.key]}
          onChange={(e) => setStandard(meta.key, e.target.value)}
          disabled={busy}
        />
      </label>
    );
  };

  const modal =
    open && portalReady
      ? createPortal(
          <div className={styles.overlay} role="dialog" aria-modal="true" onClick={close}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHead}>
                <div>
                  <h3>{editing ? 'Edit player' : 'Add player'}</h3>
                  <p className={styles.hint}>Admin only · same fields as the registration form</p>
                </div>
                <button type="button" className={styles.iconBtn} onClick={close} disabled={busy}>
                  <X size={16} aria-hidden />
                </button>
              </div>

              <div className={styles.modalBody}>
                {teamCustomFields.length > 0 && (
                  <div className={styles.teamFieldsBlock}>
                    <p className={styles.profileTitle}>Team info</p>
                    <div className={styles.grid}>
                      {teamCustomFields.map((def) => {
                        const label = def.label || 'Team field';
                        const value = teamValues[label] || teamValues[def.id] || '';
                        return (
                          <label key={def.id} className={styles.field}>
                            <span>
                              {label}
                              {def.required ? ' *' : ''}
                            </span>
                            <input
                              type="text"
                              value={value}
                              onChange={(e) =>
                                setTeamValues((prev) => ({ ...prev, [label]: e.target.value }))
                              }
                              disabled={busy}
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className={styles.grid}>{fieldKeys.map((key) => renderField(key))}</div>
              </div>

              <div className={styles.modalActions}>
                <button type="button" className={styles.secondaryBtn} onClick={close} disabled={busy}>
                  Cancel
                </button>
                <button type="button" className={styles.primaryBtn} onClick={save} disabled={busy}>
                  {busy ? 'Saving…' : editing ? 'Save changes' : 'Add player'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      {addButton ? (
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => setOpen(true)}
          disabled={disabled || busy}
        >
          <Plus size={14} aria-hidden />
          {addLabel}
        </button>
      ) : (
        <div className={styles.rowActions}>
          <button
            type="button"
            className={styles.textBtn}
            title="Edit player"
            onClick={() => setOpen(true)}
            disabled={disabled || busy || !player?.id}
          >
            Edit
          </button>
          <button
            type="button"
            className={`${styles.textBtn} ${styles.danger}`}
            title="Remove player"
            onClick={remove}
            disabled={disabled || busy || !player?.id}
          >
            Remove
          </button>
        </div>
      )}
      {modal}
    </>
  );
}
