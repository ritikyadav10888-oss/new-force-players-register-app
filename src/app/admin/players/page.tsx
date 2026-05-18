'use client';

import { useState, useEffect } from 'react';
import { Search, Users, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import styles from './players.module.css';

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

  const handleExportCSV = () => {
    const headers = ['Player Name', 'Phone', 'Team / Solo', 'Tournament', 'Role', 'Age'];
    const rows = players.map(p => [
      p.name || '-',
      p.phone || '-',
      p.teamName || '-',
      p.tournamentName || '-',
      p.role || '-',
      p.age || '-'
    ]);
    
    const csvContent = [
      headers.join(';'),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `global_players_database.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
          <button className="btn-primary" onClick={handleExportCSV}>
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
