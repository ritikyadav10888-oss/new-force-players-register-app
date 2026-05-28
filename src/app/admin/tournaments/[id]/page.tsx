'use client';

import { use, useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Users, IndianRupee } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatSportExportStyleSummary } from '@/lib/sport-utils';
import { resolveSportsProfile } from '@/lib/form-config';
import * as XLSX from 'xlsx';
import styles from './details.module.css';

// Using React.use() to unwrap params since Next.js 15+ expects params to be a Promise
export default function TournamentDetails({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  const tournamentId = unwrappedParams.id;

  const [tournament, setTournament] = useState<any>({
    id: tournamentId,
    name: 'Summer Cup 2026',
    slug: 'summer-cup-2026',
    fee: 1500,
    type: 'Team',
    sport: 'Cricket',
    customFields: []
  });

  const [registrations, setRegistrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Load from Supabase database
  useEffect(() => {
    const fetchTournamentAndRegistrations = async () => {
      setLoading(true);
      try {
        // Fetch tournament details
        const { data: tournamentData, error: tError } = await supabase
          .from('tournaments')
          .select('*')
          .eq('id', tournamentId)
          .single();

        if (tError) throw tError;

        if (tournamentData) {
          setTournament({
            id: tournamentData.id,
            name: tournamentData.name,
            slug: tournamentData.slug,
            fee: tournamentData.fee,
            type: tournamentData.type,
            sport: tournamentData.sport || 'Cricket',
            customFields: tournamentData.custom_fields || [],
            formConfig: tournamentData.form_config || {}
          });
        }

        // Fetch dynamic registrations with their players
        const { data: regsData, error: rError } = await supabase
          .from('registrations')
          .select('*, players(*)')
          .eq('tournament_id', tournamentId)
          .order('created_at', { ascending: false });

        if (rError) throw rError;

        // Map registrations to match component keys
        const mappedRegs = (regsData || []).map((r: any) => ({
          id: r.id,
          teamName: r.team_name,
          teamLogoUrl: r.team_logo_url,
          representative: r.representative,
          contact: r.contact,
          paymentStatus: r.payment_status,
          razorpayId: r.razorpay_payment_id || '-',
          players: (r.players || []).map((p: any) => ({
            name: p.name,
            email: p.email,
            phone: p.phone,
            emergencyContact: p.emergency_contact,
            dob: p.dob,
            age: p.age,
            gender: p.gender,
            aadhar: p.aadhar,
            jerseyName: p.jersey_name,
            jerseyNumber: p.jersey_number,
            jerseySize: p.jersey_size,
            photo: p.photo_url,
            role: p.role,
            battingHand: p.batting_hand,
            bowlingType: p.bowling_type,
            allRounderType: p.all_rounder_type,
            customValues: p.custom_values || {}
          }))
        }));

        setRegistrations(mappedRegs);
      } catch (err: any) {
        console.error('Error fetching details:', err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchTournamentAndRegistrations();
  }, [tournamentId]);

  const handleExportExcel = () => {
    const defaultExportConfig: Record<string, unknown> = {
      email: { enabled: true },
      phone: { enabled: true },
      emergencyContact: { enabled: true },
      dob: { enabled: true },
      age: { enabled: true },
      gender: { enabled: true },
      aadhar: { enabled: true },
      jerseyName: { enabled: true },
      jerseyNumber: { enabled: true },
      jerseySize: { enabled: true },
      photo: { enabled: true },
      cricketProfile: { enabled: true, required: false },
    };
    const rawFc =
      tournament.formConfig &&
      typeof tournament.formConfig === 'object' &&
      !Array.isArray(tournament.formConfig)
        ? (tournament.formConfig as Record<string, unknown>)
        : {};
    const merged = { ...defaultExportConfig, ...rawFc };
    const config = {
      ...merged,
      cricketProfile: resolveSportsProfile(merged),
    } as Record<string, { enabled?: boolean; required?: boolean } | undefined>;

    const isTeam = tournament.type === 'Team';

    // Define dynamic CSV headers based on tournament type
    const headers = [
      'Registration ID',
      isTeam ? 'Team Name' : 'Player Name',
    ];

    if (isTeam) {
      headers.push('Representative', 'Contact Mobile', 'Team Logo URL');
    } else {
      headers.push('Contact Info');
    }

    headers.push('Payment Status', 'Razorpay ID');

    // For team flow, we also append Roster player columns. For individual, they are the same player
    if (isTeam) {
      headers.push('Roster Player Name');
    }

    if (config.email?.enabled) headers.push('Player Email');
    if (config.phone?.enabled) headers.push('Player Phone');
    if (config.emergencyContact?.enabled) headers.push('Emergency Contact');
    if (config.dob?.enabled) headers.push('Player DOB');
    if (config.age?.enabled) headers.push('Player Age');
    if (config.gender?.enabled) headers.push('Gender');
    if (config.aadhar?.enabled) headers.push('Player Aadhar');
    if (config.jerseyName?.enabled) headers.push('Jersey Name');
    if (config.jerseyNumber?.enabled) headers.push('Jersey Number');
    if (config.jerseySize?.enabled) headers.push('Jersey Size');
    if (config.photo?.enabled) headers.push('Player Photo URL');

    if (config.cricketProfile?.enabled) {
      headers.push('Sport role(s)');
      headers.push('Sport style / details');
    }

    // Collect all dynamic custom field labels
    const customLabels = tournament.customFields?.map((f: any) => f.label) || [];
    headers.push(...customLabels);

    // Flatten data for CSV
    const rows: string[][] = [];
    registrations.forEach(reg => {
      if (!reg.players || reg.players.length === 0) {
        const baseRow = [
          reg.id,
          reg.teamName || '-',
        ];
        if (isTeam) {
          baseRow.push(reg.representative || '-', reg.contact || '-', reg.teamLogoUrl || '-');
        } else {
          baseRow.push(reg.contact || '-');
        }
        baseRow.push(reg.paymentStatus || '-', reg.razorpayId || '-');

        const remainingLength = headers.length - baseRow.length;
        for (let i = 0; i < remainingLength; i++) {
          baseRow.push('-');
        }
        rows.push(baseRow);
      } else {
        reg.players.forEach((player: any) => {
          const row = [
            reg.id,
            isTeam ? (reg.teamName || '-') : (player.name || '-'),
          ];

          if (isTeam) {
            row.push(reg.representative || '-', reg.contact || '-', reg.teamLogoUrl || '-');
          } else {
            row.push(reg.contact || '-');
          }

          row.push(reg.paymentStatus || '-', reg.razorpayId || '-');

          if (isTeam) {
            row.push(player.name || '-');
          }

          if (config.email?.enabled) row.push(player.email || '-');
          if (config.phone?.enabled) row.push(player.phone || '-');
          if (config.emergencyContact?.enabled) row.push(player.emergencyContact || '-');
          if (config.dob?.enabled) row.push(player.dob || '-');
          if (config.age?.enabled) row.push(player.age || '-');
          if (config.gender?.enabled) row.push(player.gender || '-');
          if (config.aadhar?.enabled) row.push(player.aadhar || '-');
          if (config.jerseyName?.enabled) row.push(player.jerseyName || '-');
          if (config.jerseyNumber?.enabled) row.push(player.jerseyNumber || '-');
          if (config.jerseySize?.enabled) row.push(player.jerseySize || '-');
          if (config.photo?.enabled) row.push(player.photo || '-');

          if (config.cricketProfile?.enabled) {
            row.push(player.role || '-');
            row.push(formatSportExportStyleSummary(tournament.sport, player));
          }

          // Extract answers to custom form builders
          customLabels.forEach((label: string) => {
            row.push(player.customValues?.[label] || '-');
          });

          rows.push(row);
        });
      }
    });

    const sheetData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // Make header row bold-ish by width hints (xlsx is limited without styles).
    const colWidths = headers.map((h) => ({
      wch: Math.min(42, Math.max(12, String(h).length + 2)),
    }));
    (ws as any)['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Players');

    const safeName = String(tournament.name || 'tournament')
      .replace(/[^a-z0-9]+/gi, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60);

    XLSX.writeFile(wb, `${safeName}_players.xlsx`, { compression: true });
  };

  if (loading) {
    return <div style={{ color: '#94a3b8', padding: '3rem', textAlign: 'center' }}>Loading registrations database...</div>;
  }

  const paidCollections = registrations.filter(r => r.paymentStatus === 'Paid').length * (Number(tournament.fee) || 0);

  return (
    <div className="animate-fade-in">
      <Link href="/admin" className={styles.backLink}>
        <ArrowLeft size={20} />
        Back to Dashboard
      </Link>
 
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1 className="gradient-text">{tournament.name}</h1>
          <p style={{ color: '#94a3b8' }}>Tournament ID: {tournament.id} • {tournament.type}</p>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Link href={`/register/${tournament.slug}`} target="_blank" className="btn-secondary">
            Preview Form
          </Link>
          <button className="btn-primary" onClick={handleExportExcel}>
            <Download size={20} />
            Export Players to Excel
          </button>
        </div>
      </header>

      <div className={styles.statsGrid}>
        <div className={styles.statBox}>
          <p className={styles.statLabel}>Total {tournament.type === 'Team' ? 'Teams' : 'Players'} Registered</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={20} color="var(--primary)" />
            <span className={styles.statValue}>{registrations.length}</span>
          </div>
        </div>
        <div className={styles.statBox}>
          <p className={styles.statLabel}>Total Roster count (Flattened)</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={20} color="var(--primary)" />
            <span className={styles.statValue}>
              {registrations.reduce((acc, reg) => acc + (reg.players?.length || 0), 0)}
            </span>
          </div>
        </div>
        <div className={styles.statBox}>
          <p className={styles.statLabel}>Total Dynamic Collections</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <IndianRupee size={20} color="var(--success)" />
            <span className={styles.statValue}>
              ₹{paidCollections.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{tournament.type === 'Team' ? 'Team Name' : 'Player Name'}</th>
              {tournament.type === 'Team' && <th>Representative</th>}
              <th>Contact Info</th>
              {tournament.type === 'Team' && <th>Roster Details</th>}
              <th>Payment Status</th>
              <th>Razorpay ID</th>
            </tr>
          </thead>
          <tbody>
            {registrations.map((reg) => (
              <tr key={reg.id}>
                <td style={{ fontWeight: 600 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {reg.teamLogoUrl && (
                      <img 
                        src={reg.teamLogoUrl} 
                        alt="Logo" 
                        style={{ width: '2rem', height: '2rem', borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.08)' }} 
                      />
                    )}
                    <span>{reg.teamName}</span>
                  </div>
                </td>
                {tournament.type === 'Team' && <td>{reg.representative}</td>}
                <td>{reg.contact}</td>
                {tournament.type === 'Team' && (
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', padding: '0.5rem 0' }}>
                      {reg.players?.map((p: any, pIdx: number) => (
                        <div key={pIdx} style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 500 }}>
                          • {p.name}
                        </div>
                      ))}
                    </div>
                  </td>
                )}
                <td>
                  <span className={`${styles.badge} ${reg.paymentStatus === 'Paid' ? styles.badgeSuccess : styles.badgeWarning}`}>
                    {reg.paymentStatus}
                  </span>
                </td>
                <td style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{reg.razorpayId}</td>
              </tr>
            ))}
            {registrations.length === 0 && (
              <tr>
                <td colSpan={tournament.type === 'Team' ? 6 : 4} style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                  No registrations found for this tournament.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
