'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Gavel, Search, Undo2, UserPlus, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { adminFetch } from '@/lib/auth/admin-client';
import { CRICKET_ROLES, formatCricketExportStyleSummary } from '@/lib/cricket-roles';
import styles from './auction.module.css';

type AuctionPlayer = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  dob: string | null;
  gender: string | null;
  role: string | null;
  age_category: string | null;
  batting_hand: string | null;
  bowling_type: string | null;
  all_rounder_type: string | null;
  jersey_name: string | null;
  jersey_number: string | null;
  jersey_size: string | null;
  custom_values: Record<string, unknown> | null;
  photo_url: string | null;
  auction_team: string | null;
  auction_price: number | null;
};

const DEFAULT_TEAM_COUNT = 10;
const EMPTY_NEW_PLAYER = {
  name: '',
  role: '',
  gender: '',
  phone: '',
  jerseyName: '',
  jerseyNumber: '',
  jerseySize: '',
  hostel: '',
};
const PRICE_UNITS = [
  { label: 'K', value: 1_000 },
  { label: 'Lakh', value: 1_00_000 },
] as const;

/** ₹1.5L, ₹50K, or plain ₹ below a thousand. */
function rupees(n: number): string {
  const short = (v: number) => Number(v.toFixed(2)).toLocaleString('en-IN');
  if (n >= 1_00_000) return `₹${short(n / 1_00_000)}L`;
  if (n >= 1_000) return `₹${short(n / 1_000)}K`;
  return `₹${n.toLocaleString('en-IN')}`;
}

/** Text answers from the form's custom questions (photos / links are skipped). */
function customAnswers(p: AuctionPlayer): [string, string][] {
  return Object.entries(p.custom_values || {})
    .map(([k, v]): [string, string] => [k, String(v ?? '').trim()])
    .filter(([, v]) => v && !/^(https?:|data:)/i.test(v));
}

function playerDetails(p: AuctionPlayer): [string, string][] {
  const style = formatCricketExportStyleSummary({
    role: p.role,
    battingHand: p.batting_hand,
    bowlingType: p.bowling_type,
    allRounderType: p.all_rounder_type,
  });
  const jersey = [p.jersey_name, p.jersey_number && `#${p.jersey_number}`, p.jersey_size]
    .filter(Boolean)
    .join(' · ');
  const rows: [string, string][] = [
    ['Role', p.role || ''],
    ['Batting / Bowling', style === '-' ? '' : style],
    ['Category', p.age_category || ''],
    ['Gender', p.gender || ''],
    ['Date of birth', p.dob || ''],
    ['Jersey', jersey],
    ['Phone', p.phone || ''],
    ['Email', p.email || ''],
    ...customAnswers(p),
  ];
  return rows.filter(([, v]) => v);
}

function downloadTeamSheets(tournamentName: string, teams: string[], players: AuctionPlayer[]) {
  const wb = XLSX.utils.book_new();
  // Fixed team-sheet columns, same for the all-teams file and a single team's file.
  const columns: [string, (p: AuctionPlayer) => string | number][] = [
    ['Player name', (p) => p.name || ''],
    ['Role', (p) => p.role || ''],
    [
      'Batting / Bowling',
      (p) => {
        const v = formatCricketExportStyleSummary({
          role: p.role,
          battingHand: p.batting_hand,
          bowlingType: p.bowling_type,
          allRounderType: p.all_rounder_type,
        });
        return v === '-' ? '' : v;
      },
    ],
    ['Gender', (p) => p.gender || ''],
    ['Jersey name', (p) => p.jersey_name || ''],
    ['Jersey no.', (p) => p.jersey_number || ''],
    ['Jersey size', (p) => p.jersey_size || ''],
    ['Phone', (p) => p.phone || ''],
    ['Hostel name', (p) => String(p.custom_values?.['Hostel name'] ?? '').trim()],
  ];
  const headers = ['#', ...columns.map(([h]) => h)];

  const summary: (string | number)[][] = [['Team', 'Players']];
  const used = new Set<string>();
  for (const team of teams) {
    const squad = players.filter((p) => p.auction_team === team);
    summary.push([team, squad.length]);
    const rows = squad.map((p, i) => [i + 1, ...columns.map(([, get]) => get(p))]);
    let sheetName = team.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Team';
    while (used.has(sheetName)) sheetName = `${sheetName.slice(0, 28)}_${used.size}`;
    used.add(sheetName);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = headers.map((h) => ({ wch: Math.max(10, h.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }
  if (teams.length > 1) {
    const ws = XLSX.utils.aoa_to_sheet(summary);
    ws['!cols'] = [{ wch: 24 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Summary');
    wb.SheetNames.unshift(wb.SheetNames.pop()!);
  }
  const base = `${tournamentName.trim() || 'auction'}${teams.length === 1 ? `_${teams[0]}` : ''}`;
  XLSX.writeFile(wb, `${base.replace(/[^\w-]+/g, '_')}_team_sheet.xlsx`, { compression: true });
}

export default function AuctionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tournamentName, setTournamentName] = useState('');
  const [teams, setTeams] = useState<string[]>([]);
  const [players, setPlayers] = useState<AuctionPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamDraft, setTeamDraft] = useState<string[]>([]);
  const [editingTeams, setEditingTeams] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [saleTeam, setSaleTeam] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [priceUnit, setPriceUnit] = useState<number>(1_00_000);
  const [saving, setSaving] = useState(false);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [newPlayer, setNewPlayer] = useState(EMPTY_NEW_PLAYER);

  const load = useCallback(
    () =>
      adminFetch(`/api/admin/tournaments/${id}/auction`)
        .then(async (res) => {
          const body = await res.json();
          if (!res.ok) throw new Error(body.error || 'Failed to load auction');
          setTournamentName(body.tournament.name);
          setTeams(body.teams);
          setPlayers(body.players);
          if (body.teams.length === 0) {
            setTeamDraft(Array.from({ length: DEFAULT_TEAM_COUNT }, (_, i) => `Team ${i + 1}`));
            setEditingTeams(true);
          }
        })
        .catch((err) => {
          toast.error(err instanceof Error ? err.message : 'Failed to load auction');
        })
        .finally(() => setLoading(false)),
    [id]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const pool = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players.filter(
      (p) =>
        !p.auction_team &&
        (!q || `${p.name || ''} ${p.phone || ''} ${p.role || ''}`.toLowerCase().includes(q))
    );
  }, [players, search]);

  const selected = players.find((p) => p.id === selectedId) || null;
  const soldCount = players.filter((p) => p.auction_team).length;
  const totalSpent = players.reduce((sum, p) => sum + (p.auction_team ? p.auction_price || 0 : 0), 0);

  const saveTeams = async () => {
    setSaving(true);
    try {
      const res = await adminFetch(`/api/admin/tournaments/${id}/auction`, {
        method: 'PUT',
        body: JSON.stringify({ teams: teamDraft }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to save teams');
      toast.success('Teams saved');
      setEditingTeams(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save teams');
    } finally {
      setSaving(false);
    }
  };

  const recordSale = async (playerId: string, team: string | null, price: number | null) => {
    setSaving(true);
    try {
      const res = await adminFetch(`/api/admin/tournaments/${id}/auction`, {
        method: 'POST',
        body: JSON.stringify({ playerId, team, price }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to save');
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === playerId ? { ...p, auction_team: team, auction_price: team ? price : null } : p
        )
      );
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const sell = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    if (!saleTeam) {
      toast.error('Choose the team that bought this player.');
      return;
    }
    const price = Math.round(Number(salePrice) * priceUnit);
    if (!Number.isFinite(price) || price < 0 || salePrice.trim() === '') {
      toast.error('Enter the sold price.');
      return;
    }
    if (await recordSale(selected.id, saleTeam, price)) {
      toast.success(`${selected.name} sold to ${saleTeam} for ${rupees(price)}`);
      setSelectedId('');
      setSaleTeam('');
      setSalePrice('');
      setSearch('');
    }
  };

  const addPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newPlayer.name.trim();
    if (!name) {
      toast.error('Enter the player name.');
      return;
    }
    setSaving(true);
    try {
      const res = await adminFetch('/api/admin/players', {
        method: 'POST',
        body: JSON.stringify({
          tournamentId: id,
          name,
          role: newPlayer.role,
          gender: newPlayer.gender,
          phone: newPlayer.phone,
          jerseyName: newPlayer.jerseyName,
          jerseyNumber: newPlayer.jerseyNumber,
          jerseySize: newPlayer.jerseySize,
          customValues: newPlayer.hostel.trim() ? { 'Hostel name': newPlayer.hostel.trim() } : {},
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to add player');
      toast.success(`${name} added to the auction`);
      setNewPlayer(EMPTY_NEW_PLAYER);
      setAddingPlayer(false);
      await load();
      setSelectedId(body.playerId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add player');
    } finally {
      setSaving(false);
    }
  };

  const release = async (p: AuctionPlayer) => {
    if (await recordSale(p.id, null, null)) toast.success(`${p.name} is back in the auction pool`);
  };

  if (loading) return <p className={styles.muted}>Loading auction…</p>;

  return (
    <div className="animate-fade-in">
      <Link href={`/admin/tournaments/${id}`} className={styles.backLink}>
        <ArrowLeft size={18} />
        Back to tournament
      </Link>

      <header className={styles.header}>
        <div>
          <h1 className="gradient-text">Auction</h1>
          <p className={styles.muted}>{tournamentName}</p>
        </div>
        <div className={styles.stats}>
          <span className={styles.statPill}>
            <strong>{soldCount}</strong> / {players.length} sold
          </span>
          <span className={styles.statPill}>
            <strong>{rupees(totalSpent)}</strong> spent
          </span>
          {teams.length > 0 && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => downloadTeamSheets(tournamentName, teams, players)}
            >
              <Download size={16} aria-hidden /> Team sheets
            </button>
          )}
          {!editingTeams && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setTeamDraft(teams);
                setEditingTeams(true);
              }}
            >
              Edit teams
            </button>
          )}
        </div>
      </header>

      {editingTeams && (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Auction teams</h2>
          <p className={styles.muted}>
            Name each team. Renaming a team keeps its bought players; removing a team sends its
            players back to the pool.
          </p>
          <div className={styles.teamInputs}>
            {teamDraft.map((name, i) => (
              <input
                key={i}
                value={name}
                onChange={(e) =>
                  setTeamDraft((prev) => prev.map((t, j) => (j === i ? e.target.value : t)))
                }
                placeholder={`Team ${i + 1}`}
              />
            ))}
          </div>
          <div className={styles.row}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setTeamDraft((prev) => [...prev, `Team ${prev.length + 1}`])}
            >
              Add team
            </button>
            {teamDraft.length > 1 && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setTeamDraft((prev) => prev.slice(0, -1))}
              >
                Remove last team
              </button>
            )}
            <button type="button" className="btn-primary" disabled={saving} onClick={saveTeams}>
              Save teams
            </button>
            {teams.length > 0 && (
              <button type="button" className="btn-secondary" onClick={() => setEditingTeams(false)}>
                Cancel
              </button>
            )}
          </div>
        </section>
      )}

      {teams.length > 0 && (
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>
              <Gavel size={18} aria-hidden /> Sell a player
            </h2>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setAddingPlayer((v) => !v)}
            >
              {addingPlayer ? <X size={16} aria-hidden /> : <UserPlus size={16} aria-hidden />}
              {addingPlayer ? 'Close' : 'Add player'}
            </button>
          </div>

          {addingPlayer && (
            <form className={styles.addForm} onSubmit={addPlayer}>
              <p className={styles.muted}>
                For a player who isn&apos;t registered in the app. Only the name is required.
              </p>
              <div className={styles.addGrid}>
                <label className={styles.field}>
                  <span>Player name *</span>
                  <input
                    value={newPlayer.name}
                    onChange={(e) => setNewPlayer((v) => ({ ...v, name: e.target.value }))}
                    required
                    autoFocus
                  />
                </label>
                <label className={styles.field}>
                  <span>Role</span>
                  <select
                    value={newPlayer.role}
                    onChange={(e) => setNewPlayer((v) => ({ ...v, role: e.target.value }))}
                  >
                    <option value="">—</option>
                    {CRICKET_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Gender</span>
                  <select
                    value={newPlayer.gender}
                    onChange={(e) => setNewPlayer((v) => ({ ...v, gender: e.target.value }))}
                  >
                    <option value="">—</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Phone</span>
                  <input
                    type="tel"
                    value={newPlayer.phone}
                    onChange={(e) => setNewPlayer((v) => ({ ...v, phone: e.target.value }))}
                  />
                </label>
                <label className={styles.field}>
                  <span>Jersey name</span>
                  <input
                    value={newPlayer.jerseyName}
                    onChange={(e) => setNewPlayer((v) => ({ ...v, jerseyName: e.target.value }))}
                  />
                </label>
                <label className={styles.field}>
                  <span>Jersey no.</span>
                  <input
                    inputMode="numeric"
                    value={newPlayer.jerseyNumber}
                    onChange={(e) => setNewPlayer((v) => ({ ...v, jerseyNumber: e.target.value }))}
                  />
                </label>
                <label className={styles.field}>
                  <span>Jersey size</span>
                  <input
                    value={newPlayer.jerseySize}
                    onChange={(e) => setNewPlayer((v) => ({ ...v, jerseySize: e.target.value }))}
                    placeholder="e.g. M, L, XL"
                  />
                </label>
                <label className={styles.field}>
                  <span>Hostel name</span>
                  <input
                    value={newPlayer.hostel}
                    onChange={(e) => setNewPlayer((v) => ({ ...v, hostel: e.target.value }))}
                  />
                </label>
              </div>
              <div className={styles.row}>
                <button type="submit" className="btn-primary" disabled={saving}>
                  Add to auction
                </button>
              </div>
            </form>
          )}
          <form className={styles.sellForm} onSubmit={sell}>
            <div className={styles.pickPlayer}>
              <label className={styles.searchBox}>
                <Search size={16} aria-hidden />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${pool.length} unsold player(s)`}
                />
              </label>
              <ul className={styles.poolList}>
                {pool.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={`${styles.poolItem} ${p.id === selectedId ? styles.poolItemActive : ''}`}
                      onClick={() => setSelectedId(p.id)}
                    >
                      <PlayerAvatar player={p} />
                      <span className={styles.poolName}>
                        {p.name}
                        <small>{[p.role, p.age_category].filter(Boolean).join(' · ')}</small>
                      </span>
                    </button>
                  </li>
                ))}
                {pool.length === 0 && (
                  <li className={styles.muted}>
                    {search ? 'No unsold player matches.' : 'Every player has been sold.'}
                  </li>
                )}
              </ul>
            </div>

            <div className={styles.saleBox}>
              {selected ? (
                <>
                  <div className={styles.salePlayer}>
                    <PlayerAvatar player={selected} large />
                    <div>
                      <strong className={styles.salePlayerName}>{selected.name}</strong>
                      {selected.role && <span className={styles.muted}>{selected.role}</span>}
                    </div>
                  </div>

                  <dl className={styles.details}>
                    {playerDetails(selected).map(([label, value]) => (
                      <div key={label} className={styles.detailRow}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>

                  <div className={styles.field}>
                    <span>Sold to</span>
                    <div className={styles.teamChoices} role="radiogroup" aria-label="Sold to">
                      {teams.map((t) => (
                        <button
                          key={t}
                          type="button"
                          role="radio"
                          aria-checked={saleTeam === t}
                          className={`${styles.teamChoice} ${saleTeam === t ? styles.teamChoiceActive : ''}`}
                          onClick={() => setSaleTeam(t)}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className={styles.field}>
                    <span>Price</span>
                    <div className={styles.priceRow}>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        value={salePrice}
                        onChange={(e) => setSalePrice(e.target.value)}
                        placeholder={priceUnit === 1_00_000 ? 'e.g. 1.5' : 'e.g. 50'}
                        aria-label={`Price in ${priceUnit === 1_00_000 ? 'lakh' : 'thousand'}`}
                      />
                      <div className={styles.unitToggle} role="radiogroup" aria-label="Price unit">
                        {PRICE_UNITS.map((u) => (
                          <button
                            key={u.label}
                            type="button"
                            role="radio"
                            aria-checked={priceUnit === u.value}
                            className={priceUnit === u.value ? styles.unitActive : ''}
                            onClick={() => setPriceUnit(u.value)}
                          >
                            {u.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <button type="submit" className={`btn-primary ${styles.soldBtn}`} disabled={saving}>
                    <Gavel size={16} aria-hidden />
                    {saleTeam ? `Sold to ${saleTeam}` : 'Sold'}
                    {Number(salePrice) > 0 && ` · ${rupees(Math.round(Number(salePrice) * priceUnit))}`}
                  </button>
                </>
              ) : (
                <p className={styles.muted}>Pick a player from the list to see their details and sell them.</p>
              )}
            </div>
          </form>
        </section>
      )}

      <section className={styles.teamGrid}>
        {teams.map((team) => {
          const squad = players.filter((p) => p.auction_team === team);
          const spent = squad.reduce((sum, p) => sum + (p.auction_price || 0), 0);
          return (
            <article key={team} className={styles.teamCard}>
              <header className={styles.teamHeader}>
                <div>
                  <h3>{team}</h3>
                  <span className={styles.muted}>
                    <Users size={13} aria-hidden /> {squad.length} player(s) · {rupees(spent)}
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => downloadTeamSheets(tournamentName, [team], players)}
                  aria-label={`Download ${team} team sheet`}
                  title="Download team sheet"
                >
                  <Download size={16} />
                </button>
              </header>
              {squad.length === 0 ? (
                <p className={styles.emptySeat}>No players yet</p>
              ) : (
                <ol className={styles.seats}>
                  {squad.map((p) => (
                    <li key={p.id} className={styles.seat}>
                      <PlayerAvatar player={p} />
                      <span className={styles.seatName}>
                        {p.name}
                        {p.role && <small>{p.role}</small>}
                      </span>
                      <span className={styles.seatPrice}>{rupees(p.auction_price || 0)}</span>
                      <button
                        type="button"
                        className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                        onClick={() => release(p)}
                        disabled={saving}
                        aria-label={`Send ${p.name} back to the pool`}
                        title="Send back to pool"
                      >
                        <Undo2 size={14} />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}

function PlayerAvatar({ player, large }: { player: AuctionPlayer; large?: boolean }) {
  const cls = `${styles.avatar} ${large ? styles.avatarLarge : ''}`;
  if (player.photo_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={player.photo_url} alt="" className={cls} />;
  }
  return <span className={cls}>{(player.name || '?').trim().charAt(0).toUpperCase()}</span>;
}
