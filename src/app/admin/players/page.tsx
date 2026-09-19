'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search, Users, Download, Plus, Pencil, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { adminFetch } from '@/lib/auth/admin-client';
import * as XLSX from 'xlsx';
import styles from './players.module.css';

const EXCEL_MAX_CELL_CHARS = 32767;
function excelSafeCell(v: unknown): string {
  if (v == null) return '-';
  const s = String(v);
  if (s.length <= EXCEL_MAX_CELL_CHARS) return s;
  return `${s.slice(0, EXCEL_MAX_CELL_CHARS - 30)}… (trimmed ${s.length - EXCEL_MAX_CELL_CHARS} chars)`;
}

type PlayerRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  emergencyContact: string;
  role: string;
  age: string;
  dob: string;
  gender: string;
  jerseyName: string;
  jerseyNumber: string;
  jerseySize: string;
  teamName: string;
  tournamentName: string;
  tournamentId: string | null;
  registrationId: string | null;
};

type TournamentOption = { id: string; name: string; type?: string };

type PlayerForm = {
  name: string;
  phone: string;
  email: string;
  emergencyContact: string;
  dob: string;
  age: string;
  gender: string;
  role: string;
  jerseyName: string;
  jerseyNumber: string;
  jerseySize: string;
  aadhar: string;
  battingHand: string;
  bowlingType: string;
  allRounderType: string;
  teamName: string;
  tournamentId: string;
};

const emptyForm = (): PlayerForm => ({
  name: '',
  phone: '',
  email: '',
  emergencyContact: '',
  dob: '',
  age: '',
  gender: '',
  role: '',
  jerseyName: '',
  jerseyNumber: '',
  jerseySize: '',
  aadhar: '',
  battingHand: '',
  bowlingType: '',
  allRounderType: '',
  teamName: '',
  tournamentId: '',
});

function rowToForm(p: PlayerRow): PlayerForm {
  return {
    ...emptyForm(),
    name: p.name || '',
    phone: p.phone || '',
    email: p.email || '',
    emergencyContact: p.emergencyContact || '',
    dob: p.dob || '',
    age: p.age || '',
    gender: p.gender || '',
    role: p.role || '',
    jerseyName: p.jerseyName || '',
    jerseyNumber: p.jerseyNumber || '',
    jerseySize: p.jerseySize || '',
    teamName: p.teamName && p.teamName !== '-' ? p.teamName : '',
    tournamentId: p.tournamentId || '',
  };
}

export default function PlayersDatabase() {
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [tournaments, setTournaments] = useState<TournamentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PlayerForm>(emptyForm);

  const loadPlayers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch('/api/admin/players');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to load players');
      setPlayers(body.players || []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to load players');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  useEffect(() => {
    const loadTournaments = async () => {
      try {
        const res = await adminFetch('/api/admin/tournaments');
        const body = await res.json();
        if (!res.ok) return;
        setTournaments(
          (body.tournaments || []).map((t: { id: string; name: string; type?: string }) => ({
            id: t.id,
            name: t.name,
            type: t.type,
          }))
        );
      } catch {
        /* ignore — create modal will show empty list */
      }
    };
    loadTournaments();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setModal('create');
  };

  const openEdit = async (p: PlayerRow) => {
    setEditingId(p.id);
    setForm(rowToForm(p));
    setModal('edit');
    try {
      const res = await adminFetch(`/api/admin/players/${p.id}`);
      const body = await res.json();
      if (res.ok && body.player) {
        const full = body.player as PlayerRow & {
          aadhar?: string;
          battingHand?: string;
          bowlingType?: string;
          allRounderType?: string;
        };
        setForm({
          ...rowToForm(full),
          aadhar: full.aadhar || '',
          battingHand: full.battingHand || '',
          bowlingType: full.bowlingType || '',
          allRounderType: full.allRounderType || '',
        });
      }
    } catch {
      /* keep list-row data */
    }
  };

  const closeModal = () => {
    if (busy) return;
    setModal(null);
    setEditingId(null);
    setForm(emptyForm());
  };

  const setField = (key: keyof PlayerForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Player name is required.');
      return;
    }
    if (modal === 'create' && !form.tournamentId) {
      toast.error('Select a tournament.');
      return;
    }

    setBusy(true);
    try {
      if (modal === 'create') {
        const res = await adminFetch('/api/admin/players', {
          method: 'POST',
          body: JSON.stringify({
            tournamentId: form.tournamentId,
            teamName: form.teamName.trim() || form.name.trim(),
            name: form.name.trim(),
            phone: form.phone.trim(),
            email: form.email.trim(),
            emergencyContact: form.emergencyContact.trim(),
            dob: form.dob.trim(),
            age: form.age.trim(),
            gender: form.gender.trim(),
            role: form.role.trim(),
            jerseyName: form.jerseyName.trim(),
            jerseyNumber: form.jerseyNumber.trim(),
            jerseySize: form.jerseySize.trim(),
            aadhar: form.aadhar.trim(),
            battingHand: form.battingHand.trim(),
            bowlingType: form.bowlingType.trim(),
            allRounderType: form.allRounderType.trim(),
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Failed to create player');
        toast.success('Player created');
      } else if (modal === 'edit' && editingId) {
        const res = await adminFetch(`/api/admin/players/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: form.name.trim(),
            phone: form.phone.trim(),
            email: form.email.trim(),
            emergencyContact: form.emergencyContact.trim(),
            dob: form.dob.trim(),
            age: form.age.trim(),
            gender: form.gender.trim(),
            role: form.role.trim(),
            jerseyName: form.jerseyName.trim(),
            jerseyNumber: form.jerseyNumber.trim(),
            jerseySize: form.jerseySize.trim(),
            aadhar: form.aadhar.trim(),
            battingHand: form.battingHand.trim(),
            bowlingType: form.bowlingType.trim(),
            allRounderType: form.allRounderType.trim(),
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Failed to update player');
        toast.success('Player updated');
      }
      setModal(null);
      setEditingId(null);
      await loadPlayers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (p: PlayerRow) => {
    const label = p.name?.trim() || 'this player';
    if (
      !window.confirm(
        `Delete ${label} from ${p.tournamentName}?\n\nThis removes their registration details for that tournament only. It does not refund payment.`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await adminFetch(`/api/admin/players/${p.id}`, { method: 'DELETE' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to delete player');
      toast.success(
        body.registrationDeleted
          ? `${label} deleted (empty registration removed)`
          : `${label} deleted`
      );
      setPlayers((prev) => prev.filter((row) => row.id !== p.id));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  const handleExportExcel = () => {
    const headers = [
      'Player Name',
      'Phone',
      'Email',
      'Team / Solo',
      'Tournament',
      'Role',
      'Age',
      'DOB',
      'Gender',
    ];
    const rows = players.map((p) => [
      excelSafeCell(p.name || '-'),
      excelSafeCell(p.phone || '-'),
      excelSafeCell(p.email || '-'),
      excelSafeCell(p.teamName || '-'),
      excelSafeCell(p.tournamentName || '-'),
      excelSafeCell(p.role || '-'),
      excelSafeCell(p.age || '-'),
      excelSafeCell(p.dob || '-'),
      excelSafeCell(p.gender || '-'),
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    (ws as any)['!cols'] = headers.map((h) => ({ wch: Math.min(40, Math.max(12, h.length + 2)) }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Players');
    XLSX.writeFile(wb, 'global_players_database.xlsx', { compression: true });
  };

  if (loading) {
    return (
      <div style={{ color: '#94a3b8', padding: '3rem', textAlign: 'center' }}>
        Loading player database...
      </div>
    );
  }

  const q = search.toLowerCase();
  const filteredPlayers = players.filter(
    (p) =>
      (p.name?.toLowerCase() || '').includes(q) ||
      (p.phone || '').includes(search) ||
      (p.email?.toLowerCase() || '').includes(q) ||
      (p.teamName?.toLowerCase() || '').includes(q) ||
      (p.tournamentName?.toLowerCase() || '').includes(q)
  );

  return (
    <div className="animate-fade-in">
      <header className={styles.header}>
        <div>
          <h1 className="gradient-text" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
            Global Player Database
          </h1>
          <p style={{ color: '#94a3b8' }}>
            Superadmin CRUD — view, add, edit, or remove players across all tournaments.
          </p>
        </div>

        <div className={styles.headerActions}>
          <div className={styles.searchBox}>
            <Search size={18} color="#64748b" />
            <input
              type="text"
              placeholder="Search by name, team, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={styles.searchInput}
            />
          </div>
          <button type="button" className="btn-primary" onClick={openCreate} disabled={busy}>
            <Plus size={18} /> Add player
          </button>
          <button type="button" className="btn-primary" onClick={handleExportExcel}>
            <Download size={18} /> Export
          </button>
        </div>
      </header>

      <div className={styles.statsCard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: '3rem',
              height: '3rem',
              borderRadius: '0.5rem',
              background: 'rgba(99,102,241,0.1)',
              color: '#818cf8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Users size={24} />
          </div>
          <div>
            <div
              style={{
                fontSize: '0.8rem',
                color: '#94a3b8',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontWeight: 600,
              }}
            >
              Total Flattened Roster
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f8fafc' }}>
              {players.length}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.tableContainer}>
        {filteredPlayers.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            No players found.
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Player Name</th>
                <th>Phone / Contact</th>
                <th>Team / Registration</th>
                <th>Tournament</th>
                <th>Role</th>
                <th style={{ width: '7rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlayers.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600, color: '#f1f5f9' }}>{p.name || '-'}</td>
                  <td>{p.phone || p.emergencyContact || '-'}</td>
                  <td>
                    <span className={styles.badgeTeam}>{p.teamName}</span>
                  </td>
                  <td style={{ color: '#94a3b8' }}>{p.tournamentName}</td>
                  <td>{p.role || '-'}</td>
                  <td>
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        title="Edit player"
                        disabled={busy}
                        onClick={() => openEdit(p)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className={`${styles.iconBtn} ${styles.danger}`}
                        title="Delete player"
                        disabled={busy}
                        onClick={() => handleDelete(p)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>{modal === 'create' ? 'Add player' : 'Edit player'}</h2>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={closeModal}
                disabled={busy}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {modal === 'create' && (
                <>
                  <label className={styles.field}>
                    <span>Tournament *</span>
                    <select
                      value={form.tournamentId}
                      onChange={(e) => setField('tournamentId', e.target.value)}
                      disabled={busy}
                    >
                      <option value="">— Select tournament —</option>
                      {tournaments.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>Team / registration name</span>
                    <input
                      type="text"
                      value={form.teamName}
                      placeholder="Defaults to player name"
                      onChange={(e) => setField('teamName', e.target.value)}
                      disabled={busy}
                    />
                  </label>
                </>
              )}

              <div className={styles.formGrid}>
                <label className={`${styles.field} ${styles.fullWidth}`}>
                  <span>Full name *</span>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setField('name', e.target.value)}
                    disabled={busy}
                    required
                  />
                </label>
                <label className={styles.field}>
                  <span>Phone</span>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setField('phone', e.target.value)}
                    disabled={busy}
                  />
                </label>
                <label className={styles.field}>
                  <span>Email</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setField('email', e.target.value)}
                    disabled={busy}
                  />
                </label>
                <label className={styles.field}>
                  <span>Emergency contact</span>
                  <input
                    type="tel"
                    value={form.emergencyContact}
                    onChange={(e) => setField('emergencyContact', e.target.value)}
                    disabled={busy}
                  />
                </label>
                <label className={styles.field}>
                  <span>Date of birth</span>
                  <input
                    type="date"
                    value={form.dob}
                    onChange={(e) => setField('dob', e.target.value)}
                    disabled={busy}
                  />
                </label>
                <label className={styles.field}>
                  <span>Age</span>
                  <input
                    type="text"
                    value={form.age}
                    onChange={(e) => setField('age', e.target.value)}
                    disabled={busy}
                  />
                </label>
                <label className={styles.field}>
                  <span>Gender</span>
                  <input
                    type="text"
                    value={form.gender}
                    onChange={(e) => setField('gender', e.target.value)}
                    disabled={busy}
                  />
                </label>
                <label className={styles.field}>
                  <span>Role / position</span>
                  <input
                    type="text"
                    value={form.role}
                    onChange={(e) => setField('role', e.target.value)}
                    disabled={busy}
                  />
                </label>
                <label className={styles.field}>
                  <span>Jersey name</span>
                  <input
                    type="text"
                    value={form.jerseyName}
                    onChange={(e) => setField('jerseyName', e.target.value)}
                    disabled={busy}
                  />
                </label>
                <label className={styles.field}>
                  <span>Jersey number</span>
                  <input
                    type="text"
                    value={form.jerseyNumber}
                    onChange={(e) => setField('jerseyNumber', e.target.value)}
                    disabled={busy}
                  />
                </label>
                <label className={styles.field}>
                  <span>Jersey size</span>
                  <input
                    type="text"
                    value={form.jerseySize}
                    onChange={(e) => setField('jerseySize', e.target.value)}
                    disabled={busy}
                  />
                </label>
                <label className={styles.field}>
                  <span>Aadhaar</span>
                  <input
                    type="text"
                    value={form.aadhar}
                    onChange={(e) => setField('aadhar', e.target.value)}
                    disabled={busy}
                  />
                </label>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button type="button" className={styles.textBtn} onClick={closeModal} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={handleSave} disabled={busy}>
                {busy ? 'Saving…' : modal === 'create' ? 'Create player' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
