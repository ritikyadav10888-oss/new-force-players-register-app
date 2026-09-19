'use client';

import { toast } from 'sonner';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Link2, Plus, Trash2, Users } from 'lucide-react';
import { adminFetch } from '@/lib/auth/admin-client';
import {
  isMultiSportMode,
  isTeamInviteLinkType,
  isTeamInviteTournamentType,
  type SportEntry,
} from '@/lib/multi-sport';
import { type AgeCategoryDef, formatAgeCategoryRange } from '@/lib/age-categories';
import { type TournamentFeeMode, resolveTournamentPayable } from '@/lib/fee-mode';
import {
  AdminTeamLinkPlayerActions,
  type AdminRosterPlayer,
} from '@/components/team-invite/AdminTeamLinkPlayerEditor';
import styles from './teamInvitePanel.module.css';

type TeamFieldDef = {
  id: string;
  label: string;
  type: string;
  options: string;
  required: boolean;
};

type TeamInviteItem = {
  id: string;
  token: string;
  team_name: string;
  representative: string;
  contact: string;
  min_players: number;
  max_players: number;
  payment_status: string;
  playerCount: number;
  selected_sports?: string[];
  selected_age_category_id?: string | null;
  team_custom_values?: Record<string, string>;
  links: { player: string; pay: string; live: string };
};

type Props = {
  tournamentId: string;
  tournamentType: string;
  minPlayers: number;
  maxPlayers: number;
  legacyFee?: number;
  feeMode?: TournamentFeeMode;
  sportsConfig?: SportEntry[];
  ageCategories?: AgeCategoryDef[];
  teamCustomFields?: TeamFieldDef[];
  formConfig?: Record<string, unknown> | null;
  playerCustomFields?: unknown;
  sport?: string | null;
  /** Superadmin only: show add / edit / remove on invite rosters. */
  canManagePlayers?: boolean;
  /** Fired after create / delete / roster changes so parent views can refresh. */
  onChanged?: () => void | Promise<void>;
};

export function TeamInvitePanel({
  tournamentId,
  tournamentType,
  minPlayers,
  maxPlayers,
  legacyFee = 0,
  feeMode = 'flat',
  sportsConfig = [],
  ageCategories = [],
  teamCustomFields = [],
  formConfig = null,
  playerCustomFields,
  sport = null,
  canManagePlayers = false,
  onChanged,
}: Props) {
  const [items, setItems] = useState<TeamInviteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [copied, setCopied] = useState('');
  const [createdItem, setCreatedItem] = useState<TeamInviteItem | null>(null);
  const [selectedSportIds, setSelectedSportIds] = useState<string[]>([]);
  const [selectedAgeCategoryId, setSelectedAgeCategoryId] = useState('');
  const [teamFieldValues, setTeamFieldValues] = useState<Record<string, string>>({});
  const [rosterByInvite, setRosterByInvite] = useState<Record<string, AdminRosterPlayer[]>>({});
  const [rosterLoadingId, setRosterLoadingId] = useState('');
  const [expandedRosterIds, setExpandedRosterIds] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState('');
  const [form, setForm] = useState({
    teamName: '',
    representative: '',
    contact: '',
    minPlayers: String(minPlayers || 1),
    maxPlayers: String(maxPlayers || 11),
  });

  const canManageRoster = isTeamInviteLinkType(tournamentType);
  const multiSport = isMultiSportMode(sportsConfig);
  const categoryField = useMemo(
    () => teamCustomFields.find((f) => f.type === 'category') || null,
    [teamCustomFields]
  );
  // When the admin has added an "Age Category" Team Info field, that field
  // is the single source of truth for category — the standalone pill picker
  // below is hidden to avoid asking (and setting) it twice.
  const effectiveSelectedAgeCategoryId = categoryField
    ? teamFieldValues[categoryField.label] || ''
    : selectedAgeCategoryId;
  const requireAgeCategoryPick = ageCategories.length > 0 && !categoryField;

  const payable = useMemo(
    () =>
      resolveTournamentPayable({
        feeMode,
        legacyFee,
        sportsConfig,
        selectedSportIds: multiSport ? selectedSportIds : sportsConfig.map((s) => s.id),
        ageCategories,
        selectedAgeCategoryId: effectiveSelectedAgeCategoryId,
      }),
    [
      feeMode,
      legacyFee,
      sportsConfig,
      multiSport,
      selectedSportIds,
      ageCategories,
      effectiveSelectedAgeCategoryId,
    ]
  );

  const sportName = (id: string) => sportsConfig.find((s) => s.id === id)?.name || id;
  const ageCategoryName = (id: string) => ageCategories.find((c) => c.id === id)?.name || id;

  const scopeBadges = (item: TeamInviteItem) => {
    const sportIds = Array.isArray(item.selected_sports) ? item.selected_sports : [];
    const chips = [
      ...sportIds.map((id) => sportName(id)),
      item.selected_age_category_id ? ageCategoryName(item.selected_age_category_id) : null,
    ].filter((v): v is string => Boolean(v));

    const teamValues = item.team_custom_values || {};
    const teamAnswers = teamCustomFields
      .map((f) => {
        const raw = teamValues[f.label];
        if (!raw) return null;
        const display = f.type === 'category' ? ageCategoryName(raw) : raw;
        return `${f.label}: ${display}`;
      })
      .filter((v): v is string => Boolean(v));

    if (chips.length === 0 && teamAnswers.length === 0) return null;
    return (
      <>
        {chips.length > 0 ? (
          <p className={styles.meta} style={{ marginTop: '0.15rem' }}>
            {chips.join(' · ')}
          </p>
        ) : null}
        {teamAnswers.length > 0 ? (
          <p className={styles.meta} style={{ marginTop: '0.15rem' }}>
            {teamAnswers.join(' · ')}
          </p>
        ) : null}
      </>
    );
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch(
        `/api/admin/tournaments/${tournamentId}/team-invites`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load team links');
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load team links');
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  const loadRoster = useCallback(async (inviteId: string) => {
    setRosterLoadingId(inviteId);
    try {
      const res = await adminFetch(`/api/admin/team-invites/${inviteId}/players`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load roster');
      setRosterByInvite((prev) => ({
        ...prev,
        [inviteId]: Array.isArray(data.players) ? data.players : [],
      }));
      setItems((prev) =>
        prev.map((item) =>
          item.id === inviteId
            ? { ...item, playerCount: Array.isArray(data.players) ? data.players.length : item.playerCount }
            : item
        )
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load roster');
    } finally {
      setRosterLoadingId('');
    }
  }, []);

  const toggleRoster = async (inviteId: string) => {
    setExpandedRosterIds((prev) => {
      const next = new Set(prev);
      if (next.has(inviteId)) next.delete(inviteId);
      else next.add(inviteId);
      return next;
    });
    if (!rosterByInvite[inviteId]) {
      await loadRoster(inviteId);
    }
  };

  const deleteTeamLink = async (item: TeamInviteItem) => {
    const paid = String(item.payment_status).toLowerCase() === 'paid';
    const msg = paid
      ? `Delete team link "${item.team_name}"? This also removes its paid registration and all players. This cannot be undone.`
      : `Delete team link "${item.team_name}"? This removes the invite and its players. This cannot be undone.`;
    if (!confirm(msg)) return;

    setDeletingId(item.id);
    try {
      const res = await adminFetch(`/api/admin/team-invites/${item.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to delete team link');
      toast.success(`Deleted "${item.team_name}"`);
      setCreatedItem((prev) => (prev?.id === item.id ? null : prev));
      setExpandedRosterIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      setRosterByInvite((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      await load();
      await onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete team link');
    } finally {
      setDeletingId('');
    }
  };

  useEffect(() => {
    if (isTeamInviteTournamentType(tournamentType)) load();
  }, [load, tournamentType]);  if (!isTeamInviteTournamentType(tournamentType)) return null;

  const publicUrl = (path: string) =>
    typeof window === 'undefined' ? path : `${window.location.origin}${path}`;

  const copyUrl = async (path: string, key: string) => {
    const url = publicUrl(path);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
      toast.success('Link copied');
    } catch {
      window.prompt('Copy link:', url);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.teamName.trim() || !form.representative.trim() || !form.contact.trim()) {
      toast.error('Team name, representative, and contact are required');
      return;
    }
    if (multiSport && selectedSportIds.length === 0) {
      toast.error('Pick at least one sport for this link');
      return;
    }
    if (requireAgeCategoryPick && !selectedAgeCategoryId) {
      toast.error('Pick an age category for this link');
      return;
    }
    for (const field of teamCustomFields) {
      if (field.required && !String(teamFieldValues[field.label] || '').trim()) {
        toast.error(`${field.label} is required`);
        return;
      }
    }
    setCreating(true);
    try {
      const teamsBySport: Record<string, string> = {};
      for (const s of payable.selected) {
        if (s.entryType === 'team') teamsBySport[s.id] = form.teamName.trim();
      }
      const res = await adminFetch('/api/team-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournamentId,
          teamName: form.teamName.trim(),
          representative: form.representative.trim(),
          contact: form.contact.trim(),
          minPlayers: Number(form.minPlayers) || minPlayers,
          maxPlayers: Number(form.maxPlayers) || maxPlayers,
          selectedSports: multiSport ? selectedSportIds : [],
          teamsBySport,
          feeBreakdown: payable.breakdown,
          selectedAgeCategoryId: effectiveSelectedAgeCategoryId || null,
          teamCustomValues: teamFieldValues,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create team link');
      toast.success('Team links created');
      const created: TeamInviteItem = {
        id: data.id,
        token: data.token,
        team_name: data.team_name,
        representative: data.representative,
        contact: data.contact,
        min_players: data.min_players,
        max_players: data.max_players,
        payment_status: data.payment_status,
        playerCount: 0,
        selected_sports: data.selected_sports,
        selected_age_category_id: data.selected_age_category_id,
        team_custom_values: data.team_custom_values,
        links: {
          player: `/register/${data.slug}/team/${data.token}`,
          pay: `/register/${data.slug}/team/${data.token}/pay`,
          live: `/register/${data.slug}/team/${data.token}/live`,
        },
      };
      setCreatedItem(created);
      setShowForm(false);
      setForm({
        teamName: '',
        representative: '',
        contact: '',
        minPlayers: String(minPlayers || 1),
        maxPlayers: String(maxPlayers || 11),
      });
      setSelectedSportIds([]);
      setSelectedAgeCategoryId('');
      setTeamFieldValues({});
      await load();
      await onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className={styles.panel} aria-label="Team invite links">
      <div className={styles.header}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className={styles.title}>
            <Users size={18} aria-hidden />
            Team invite links
          </h2>
          <p className={styles.sub}>
            Representative pays first, then players join. Each team link is limited to this
            tournament&apos;s roster size ({minPlayers || 1}–{maxPlayers || 11}).
          </p>
        </div>
        <button type="button" className={styles.addBtn} onClick={() => setShowForm((v) => !v)}>
          <Plus size={16} aria-hidden />
          {showForm ? 'Cancel' : 'New team'}
        </button>
      </div>

      {showForm ? (
        <form onSubmit={handleCreate} className={styles.form}>
          <label>
            Team name
            <input
              value={form.teamName}
              onChange={(e) => setForm((f) => ({ ...f, teamName: e.target.value }))}
              required
              placeholder="e.g. Mumbai Strikers"
            />
          </label>
          <label>
            Representative
            <input
              value={form.representative}
              onChange={(e) => setForm((f) => ({ ...f, representative: e.target.value }))}
              required
              placeholder="Captain / manager name"
            />
          </label>
          <label>
            Contact
            <input
              value={form.contact}
              onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
              required
              placeholder="Phone number"
            />
          </label>
          <div className={styles.row}>
            <label>
              Min players
              <input
                type="number"
                min={minPlayers || 1}
                max={maxPlayers || 11}
                value={form.minPlayers}
                onChange={(e) => {
                  const next = e.target.value;
                  setForm((f) => {
                    const min = Math.min(
                      Number(maxPlayers) || 11,
                      Math.max(Number(minPlayers) || 1, Number(next) || Number(minPlayers) || 1)
                    );
                    const max = Math.max(min, Number(f.maxPlayers) || min);
                    return {
                      ...f,
                      minPlayers: String(min),
                      maxPlayers: String(Math.min(Number(maxPlayers) || 11, max)),
                    };
                  });
                }}
              />
            </label>
            <label>
              Max players
              <input
                type="number"
                min={minPlayers || 1}
                max={maxPlayers || 11}
                value={form.maxPlayers}
                onChange={(e) => {
                  const next = e.target.value;
                  setForm((f) => {
                    const max = Math.min(
                      Number(maxPlayers) || 11,
                      Math.max(Number(minPlayers) || 1, Number(next) || Number(maxPlayers) || 11)
                    );
                    const min = Math.min(max, Number(f.minPlayers) || Number(minPlayers) || 1);
                    return {
                      ...f,
                      maxPlayers: String(max),
                      minPlayers: String(Math.max(Number(minPlayers) || 1, min)),
                    };
                  });
                }}
              />
            </label>
          </div>
          <p className={styles.muted} style={{ margin: 0 }}>
            Limited by tournament roster: {minPlayers || 1}–{maxPlayers || 11} players per team.
          </p>

          {multiSport ? (
            <div>
              <label style={{ marginBottom: '0.4rem' }}>Sport(s) for this link</label>
              <div className={styles.pillGroup}>
                {sportsConfig.map((s) => {
                  const active = selectedSportIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={active ? styles.pillActive : styles.pill}
                      onClick={() =>
                        setSelectedSportIds((prev) =>
                          prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id]
                        )
                      }
                    >
                      {s.name}
                      {s.fee > 0 ? ` · ₹${s.fee}` : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {requireAgeCategoryPick ? (
            <div>
              <label style={{ marginBottom: '0.4rem' }}>Age category for this link</label>
              <div className={styles.pillGroup}>
                {ageCategories.map((c) => {
                  const active = selectedAgeCategoryId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={active ? styles.pillActive : styles.pill}
                      onClick={() => setSelectedAgeCategoryId(c.id)}
                    >
                      {c.name} ({formatAgeCategoryRange(c)})
                      {c.fee > 0 ? ` · ₹${c.fee}` : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {multiSport || requireAgeCategoryPick || categoryField ? (
            <p className={styles.muted} style={{ margin: 0 }}>
              Representative will be charged ₹{payable.fee} for this link
              {payable.breakdown.length ? ` (${payable.breakdown.map((b) => b.name).join(' + ')})` : ''}.
            </p>
          ) : null}

          {teamCustomFields.map((field) => (
            <label key={field.id}>
              {field.label}
              {field.required ? ' *' : ''}
              {field.type === 'select' || field.type === 'category' ? (
                <select
                  value={teamFieldValues[field.label] || ''}
                  required={field.required}
                  onChange={(e) =>
                    setTeamFieldValues((prev) => ({ ...prev, [field.label]: e.target.value }))
                  }
                >
                  <option value="">-- Select {field.label} --</option>
                  {(field.type === 'category'
                    ? ageCategories.map((c) => ({
                        value: c.id,
                        label: `${c.name} (${formatAgeCategoryRange(c)}${
                          feeMode === 'category' && c.fee > 0
                            ? ` · ₹${c.fee.toLocaleString('en-IN')}`
                            : ''
                        })`,
                      }))
                    : (field.options || '')
                        .split(',')
                        .map((o) => o.trim())
                        .filter(Boolean)
                        .map((o) => ({ value: o, label: o }))
                  ).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type === 'number' ? 'number' : 'text'}
                  value={teamFieldValues[field.label] || ''}
                  required={field.required}
                  onChange={(e) =>
                    setTeamFieldValues((prev) => ({ ...prev, [field.label]: e.target.value }))
                  }
                />
              )}
            </label>
          ))}

          <button type="submit" className={styles.submitBtn} disabled={creating}>
            {creating ? 'Creating…' : 'Create team links'}
          </button>
        </form>
      ) : null}

      {createdItem ? (
        <div className={styles.createdCard}>
          <div className={styles.createdHeader}>
            <div>
              <p className={styles.createdEyebrow}>New team created</p>
              <h3 className={styles.createdTitle}>{createdItem.team_name}</h3>
              {scopeBadges(createdItem)}
              <p className={styles.meta}>
                1) Share <strong>Pay</strong> with the representative first. After they pay, share
                Player + Live with the squad.
              </p>
            </div>
            <button
              type="button"
              className={styles.createdDismiss}
              onClick={() => setCreatedItem(null)}
              aria-label="Dismiss created links"
            >
              Close
            </button>
          </div>

          <div className={styles.createdLinks}>
            <div className={styles.linkRow}>
              <Link2 size={13} aria-hidden />
              <span className={styles.linkLabel}>Pay (first)</span>
              <code className={styles.path}>{publicUrl(createdItem.links.pay)}</code>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => copyUrl(createdItem.links.pay, `${createdItem.id}-new-pay`)}
              >
                <Copy size={13} aria-hidden />
                {copied === `${createdItem.id}-new-pay` ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className={styles.linkRow}>
              <Link2 size={13} aria-hidden />
              <span className={styles.linkLabel}>Player</span>
              <code className={styles.path}>{publicUrl(createdItem.links.player)}</code>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => copyUrl(createdItem.links.player, `${createdItem.id}-new-player`)}
              >
                <Copy size={13} aria-hidden />
                {copied === `${createdItem.id}-new-player` ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className={styles.linkRow}>
              <Link2 size={13} aria-hidden />
              <span className={styles.linkLabel}>Live</span>
              <code className={styles.path}>{publicUrl(createdItem.links.live)}</code>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => copyUrl(createdItem.links.live, `${createdItem.id}-new-live`)}
              >
                <Copy size={13} aria-hidden />
                {copied === `${createdItem.id}-new-live` ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className={styles.muted}>Loading team links…</p>
      ) : items.length === 0 ? (
        <p className={styles.muted}>No team links yet. Create one for split player / rep payment flow.</p>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => {
            const paid = String(item.payment_status).toLowerCase() === 'paid';
            return (
              <li key={item.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <div>
                    <p className={styles.teamName}>{item.team_name}</p>
                    <p className={styles.meta}>
                      {item.representative} · {item.playerCount}/{item.max_players} players
                    </p>
                    {scopeBadges(item)}
                  </div>
                  <div className={styles.cardTopRight}>
                    <span className={paid ? styles.badgePaid : styles.badgePending}>
                      {paid ? 'Paid' : 'Pending'}
                    </span>
                    {canManageRoster && (
                      <button
                        type="button"
                        className={styles.deleteCardBtn}
                        title="Delete team link"
                        disabled={deletingId === item.id}
                        onClick={() => deleteTeamLink(item)}
                      >
                        <Trash2 size={14} aria-hidden />
                        {deletingId === item.id ? 'Deleting…' : 'Delete'}
                      </button>
                    )}
                  </div>
                </div>
                <div className={styles.linkRow}>
                  <Link2 size={13} aria-hidden />
                  <span className={styles.linkLabel}>Pay</span>
                  <code className={styles.path}>{publicUrl(item.links.pay)}</code>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => copyUrl(item.links.pay, `${item.id}-pay`)}
                  >
                    <Copy size={13} />
                    {copied === `${item.id}-pay` ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className={styles.linkRow}>
                  <Link2 size={13} aria-hidden />
                  <span className={styles.linkLabel}>Player</span>
                  <code className={styles.path}>{publicUrl(item.links.player)}</code>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => copyUrl(item.links.player, `${item.id}-player`)}
                  >
                    <Copy size={13} />
                    {copied === `${item.id}-player` ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className={styles.linkRow}>
                  <Link2 size={13} aria-hidden />
                  <span className={styles.linkLabel}>Live</span>
                  <code className={styles.path}>{publicUrl(item.links.live)}</code>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => copyUrl(item.links.live, `${item.id}-live`)}
                  >
                    <Copy size={13} />
                    {copied === `${item.id}-live` ? 'Copied' : 'Copy'}
                  </button>
                </div>
                {canManageRoster && (
                  <div className={styles.rosterBlock}>
                    <button
                      type="button"
                      className={styles.rosterToggle}
                      onClick={() => toggleRoster(item.id)}
                    >
                      <Users size={13} aria-hidden />
                      {expandedRosterIds.has(item.id) ? 'Hide roster' : 'Manage roster'}
                      <span>
                        {item.playerCount}/{item.max_players}
                      </span>
                    </button>
                    {expandedRosterIds.has(item.id) && (
                      <div className={styles.rosterList}>
                        {rosterLoadingId === item.id ? (
                          <p className={styles.muted}>Loading players…</p>
                        ) : (rosterByInvite[item.id] || []).length === 0 ? (
                          <p className={styles.muted}>No players on this team link yet.</p>
                        ) : (
                          (rosterByInvite[item.id] || []).map((p) => (
                            <div key={p.id} className={styles.rosterRow}>
                              <div className={styles.rosterInfo}>
                                <strong>{p.name || '-'}</strong>
                                <span>
                                  {[p.phone, p.role, p.dob ? `DOB ${p.dob}` : null]
                                    .filter(Boolean)
                                    .join(' · ') || '—'}
                                </span>
                              </div>
                              {canManagePlayers && (
                                <AdminTeamLinkPlayerActions
                                  mode={{ kind: 'invite', inviteId: item.id }}
                                  player={p}
                                  formConfig={formConfig}
                                  customFields={playerCustomFields}
                                  teamCustomFields={teamCustomFields}
                                  teamCustomValues={item.team_custom_values || {}}
                                  sport={sport}
                                  onChanged={async () => {
                                    await loadRoster(item.id);
                                    await onChanged?.();
                                  }}
                                />
                              )}
                            </div>
                          ))
                        )}
                        {canManagePlayers && (
                          <AdminTeamLinkPlayerActions
                            mode={{ kind: 'invite', inviteId: item.id }}
                            addButton
                            formConfig={formConfig}
                            customFields={playerCustomFields}
                            teamCustomFields={teamCustomFields}
                            teamCustomValues={item.team_custom_values || {}}
                            sport={sport}
                            onChanged={async () => {
                              await loadRoster(item.id);
                              await onChanged?.();
                            }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
