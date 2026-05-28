'use client';

import { useState, useEffect } from 'react';
import { Search, Users, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import styles from './players.module.css';

const EXCEL_MAX_CELL_CHARS = 32767;
function excelSafeCell(v: unknown): string {
  if (v == null) return '-';
  const s = String(v);
  if (s.length <= EXCEL_MAX_CELL_CHARS) return s;
  return `${s.slice(0, EXCEL_MAX_CELL_CHARS - 30)}… (trimmed ${s.length - EXCEL_MAX_CELL_CHARS} chars)`;
}

export default function PlayersDatabase() {
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchGlobalPlayers = async () => {
      setLoading(true);
      try {
        const { data: playersData, error } = await supabase
          .from('players')
          .select('*, registrations(*, tournaments(*))');

        if (error) throw error;

        const mappedPlayers = (playersData || []).map((p: any) => {
          const reg = p.registrations || {};
          const tourney = reg.tournaments || {};

          return {
            name: p.name,
            phone: p.phone || p.emergency_contact || '-',
            teamName: reg.team_name || '-',
            tournamentName: tourney.name || 'Unknown Tournament',
            role: p.role || '-',
            age: p.age || '-',
            regId: reg.id || 'unknown'
          };
        });

        setPlayers(mappedPlayers.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '')));
      } catch (err: any) {
        console.error('Error fetching global players database:', err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchGlobalPlayers();
  }, []);

  const handleExportExcel = () => {
    const headers = ['Player Name', 'Phone', 'Team / Solo', 'Tournament', 'Role', 'Age'];
    const rows = players.map((p) => [
      excelSafeCell(p.name || '-'),
      excelSafeCell(p.phone || '-'),
      excelSafeCell(p.teamName || '-'),
      excelSafeCell(p.tournamentName || '-'),
      excelSafeCell(p.role || '-'),
      excelSafeCell(p.age || '-'),
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    (ws as any)['!cols'] = headers.map((h) => ({ wch: Math.min(40, Math.max(12, h.length + 2)) }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Players');
    XLSX.writeFile(wb, 'global_players_database.xlsx', { compression: true });
  };

  if (loading) {
    return <div style={{ color: '#94a3b8', padding: '3rem', textAlign: 'center' }}>Loading player database...</div>;
  }

  const filteredPlayers = players.filter(p => 
    (p.name?.toLowerCase() || '').includes(search.toLowerCase()) ||
    (p.phone || '').includes(search) ||
    (p.teamName?.toLowerCase() || '').includes(search.toLowerCase()) ||
    (p.tournamentName?.toLowerCase() || '').includes(search.toLowerCase())
  );

  return (
    <div className="animate-fade-in">
      <header className={styles.header}>
        <div>
          <h1 className="gradient-text" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Global Player Database</h1>
          <p style={{ color: '#94a3b8' }}>View all individual and team players across all tournaments.</p>
        </div>
        
        <div className={styles.headerActions}>
          <div className={styles.searchBox}>
            <Search size={18} color="#64748b" />
            <input 
              type="text" 
              placeholder="Search by name, team, phone..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={styles.searchInput}
            />
          </div>
          <button className="btn-primary" onClick={handleExportExcel}>
            <Download size={18} /> Export
          </button>
        </div>
      </header>
      
      <div className={styles.statsCard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '3rem', height: '3rem', borderRadius: '0.5rem', background: 'rgba(99,102,241,0.1)', color: '#818cf8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Users size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Total Flattened Roster</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f8fafc' }}>{players.length}</div>
          </div>
        </div>
      </div>

      <div className={styles.tableContainer}>
        {filteredPlayers.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>No players found.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Player Name</th>
                <th>Phone / Contact</th>
                <th>Team / Registration</th>
                <th>Tournament</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlayers.map((p, i) => (
                <tr key={`${p.regId}_${i}`}>
                  <td style={{ fontWeight: 600, color: '#f1f5f9' }}>{p.name || '-'}</td>
                  <td>{p.phone || p.emergencyContact || '-'}</td>
                  <td>
                    <span className={styles.badgeTeam}>{p.teamName}</span>
                  </td>
                  <td style={{ color: '#94a3b8' }}>{p.tournamentName}</td>
                  <td>{p.role || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
