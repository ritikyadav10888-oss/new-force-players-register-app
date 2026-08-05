'use client';

import { toast } from 'sonner';
import { useCallback, useEffect, useState } from 'react';
import { Copy, Link2, Plus, Users } from 'lucide-react';
import { adminFetch } from '@/lib/auth/admin-client';
import { isTeamInviteTournamentType } from '@/lib/multi-sport';
import styles from './teamInvitePanel.module.css';

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
  links: { player: string; pay: string; live: string };
};

type Props = {
  tournamentId: string;
  tournamentType: string;
  minPlayers: number;
  maxPlayers: number;
};

export function TeamInvitePanel({
  tournamentId,
  tournamentType,
  minPlayers,
  maxPlayers,
}: Props) {
  const [items, setItems] = useState<TeamInviteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [copied, setCopied] = useState('');
  const [createdItem, setCreatedItem] = useState<TeamInviteItem | null>(null);
  const [form, setForm] = useState({
    teamName: '',
    representative: '',
    contact: '',
    minPlayers: String(minPlayers || 1),
    maxPlayers: String(maxPlayers || 11),
  });

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

  useEffect(() => {
    if (isTeamInviteTournamentType(tournamentType)) load();
  }, [load, tournamentType]);

  if (!isTeamInviteTournamentType(tournamentType)) return null;

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
    setCreating(true);
    try {
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
      await load();
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
                  </div>
                  <span className={paid ? styles.badgePaid : styles.badgePending}>
                    {paid ? 'Paid' : 'Pending'}
                  </span>
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
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
