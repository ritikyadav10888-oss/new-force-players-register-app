'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Users, IndianRupee } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { adminFetch } from '@/lib/auth/admin-client';
import { formatSportExportStyleSummary } from '@/lib/sport-utils';
import { resolveSportsProfileForTournament } from '@/lib/form-config';
import * as XLSX from 'xlsx';
import styles from './tournamentRegistrations.module.css';

/** Batch-convert stored image refs (private bucket) into 30-day signed URLs. */
async function fetchSignedUrls(values: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(values.filter((v) => v && v !== '-'))];
  if (unique.length === 0) return {};
  try {
    const res = await adminFetch('/api/admin/signed-urls', {
      method: 'POST',
      body: JSON.stringify({ values: unique }),
    });
    if (!res.ok) return {};
    const json = (await res.json()) as { urls?: Record<string, string> };
    return json.urls || {};
  } catch {
    return {};
  }
}

const EXCEL_MAX_CELL_CHARS = 32767;
function excelSafeCell(v: unknown): string {
  if (v == null) return '-';
  const s = String(v);
  if (s.length <= EXCEL_MAX_CELL_CHARS) return s;
  return `${s.slice(0, EXCEL_MAX_CELL_CHARS - 30)}… (trimmed ${s.length - EXCEL_MAX_CELL_CHARS} chars)`;
}

type Props = {
  tournamentId: string;
  backHref: string;
  backLabel?: string;
  /** When false, hides the "Preview Form" link (e.g. read-only customer view still allowed). */
  showPreview?: boolean;
};

export default function TournamentRegistrations({
  tournamentId,
  backHref,
  backLabel = 'Back to Dashboard',
  showPreview = true,
}: Props) {
  const [tournament, setTournament] = useState<any>({
    id: tournamentId,
    name: '',
    slug: '',
    fee: 0,
    type: 'Team',
    sport: 'Cricket',
    customFields: [],
  });

  const [registrations, setRegistrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchTournamentAndRegistrations = async () => {
      setLoading(true);
      try {
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
            formConfig: tournamentData.form_config || {},
          });
        }

        const { data: regsData, error: rError } = await supabase
          .from('registrations')
          .select('*, players(*)')
          .eq('tournament_id', tournamentId)
          .order('created_at', { ascending: false });

        if (rError) throw rError;

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
            jerseyName: p.jersey_name,
            jerseyNumber: p.jersey_number,
            jerseySize: p.jersey_size,
            photo: p.photo_url,
            role: p.role,
            battingHand: p.batting_hand,
            bowlingType: p.bowling_type,
            allRounderType: p.all_rounder_type,
            customValues: p.custom_values || {},
          })),
        }));

        setRegistrations(mappedRegs);

        const imageRefs: string[] = [];
        mappedRegs.forEach((reg: any) => {
          if (reg.teamLogoUrl) imageRefs.push(reg.teamLogoUrl);
          (reg.players || []).forEach((p: any) => {
            if (p.photo) imageRefs.push(p.photo);
          });
        });
        if (imageRefs.length > 0) {
          const signed = await fetchSignedUrls(imageRefs);
          setSignedUrls(signed);
        }
      } catch (err: any) {
        console.error('Error fetching details:', err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchTournamentAndRegistrations();
  }, [tournamentId]);

  const handleExportExcel = async () => {
    const exportImageRefs: string[] = [];
    registrations.forEach((reg) => {
      if (reg.teamLogoUrl) exportImageRefs.push(reg.teamLogoUrl);
      (reg.players || []).forEach((p: any) => {
        if (p.photo) exportImageRefs.push(p.photo);
      });
    });
    const exportSigned = await fetchSignedUrls(exportImageRefs);
    const signFor = (value: unknown): string => {
      const v = value == null ? '' : String(value);
      return (v && exportSigned[v]) || v || '-';
    };

    const defaultExportConfig: Record<string, unknown> = {
      email: { enabled: true },
      phone: { enabled: true },
      emergencyContact: { enabled: true },
      dob: { enabled: true },
      age: { enabled: true },
      gender: { enabled: true },
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
      cricketProfile: resolveSportsProfileForTournament(merged, tournament.sport),
    } as Record<string, { enabled?: boolean; required?: boolean } | undefined>;

    const isTeam = tournament.type === 'Team';

    const allPlayers: any[] = registrations.flatMap((r: any) => r.players || []);
    const hasFieldData = (key: string): boolean =>
      allPlayers.some((p: any) => {
        const v = p?.[key];
        return v != null && String(v).trim() !== '' && String(v).trim() !== '-';
      });
    const show = {
      email: !!config.email?.enabled || hasFieldData('email'),
      phone: !!config.phone?.enabled || hasFieldData('phone'),
      emergencyContact: !!config.emergencyContact?.enabled || hasFieldData('emergencyContact'),
      dob: !!config.dob?.enabled || hasFieldData('dob'),
      age: !!config.age?.enabled || hasFieldData('age'),
      gender: !!config.gender?.enabled || hasFieldData('gender'),
      jerseyName: !!config.jerseyName?.enabled || hasFieldData('jerseyName'),
      jerseyNumber: !!config.jerseyNumber?.enabled || hasFieldData('jerseyNumber'),
      jerseySize: !!config.jerseySize?.enabled || hasFieldData('jerseySize'),
      photo: !!config.photo?.enabled || hasFieldData('photo'),
      sportProfile: !!config.cricketProfile?.enabled || hasFieldData('role'),
    };

    const configuredLabels: string[] = (tournament.customFields || [])
      .map((f: any) => f.label)
      .filter((l: any) => typeof l === 'string' && l.trim() !== '');
    const customLabels: string[] = [...configuredLabels];
    allPlayers.forEach((p: any) => {
      const cv = p?.customValues;
      if (cv && typeof cv === 'object') {
        Object.keys(cv).forEach((k) => {
          const val = cv[k];
          const hasVal = val != null && String(val).trim() !== '' && String(val).trim() !== '-';
          if (hasVal && !customLabels.includes(k)) customLabels.push(k);
        });
      }
    });

    const headers = ['Registration ID', isTeam ? 'Team Name' : 'Player Name'];

    if (isTeam) {
      headers.push('Representative', 'Contact Mobile', 'Team Logo URL');
    } else {
      headers.push('Contact Info');
    }

    headers.push('Payment Status', 'Razorpay ID');

    if (isTeam) {
      headers.push('Roster Player Name');
    }

    if (show.email) headers.push('Player Email');
    if (show.phone) headers.push('Player Phone');
    if (show.emergencyContact) headers.push('Emergency Contact');
    if (show.dob) headers.push('Player DOB');
    if (show.age) headers.push('Player Age');
    if (show.gender) headers.push('Gender');
    if (show.jerseyName) headers.push('Jersey Name');
    if (show.jerseyNumber) headers.push('Jersey Number');
    if (show.jerseySize) headers.push('Jersey Size');
    if (show.photo) headers.push('Player Photo URL');

    if (show.sportProfile) {
      headers.push(tournament.sport === 'Football' ? 'Position(s)' : 'Sport role(s)');
      headers.push(tournament.sport === 'Football' ? 'Positions (export)' : 'Sport style / details');
    }

    headers.push(...customLabels);

    const rows: string[][] = [];
    registrations.forEach((reg) => {
      if (!reg.players || reg.players.length === 0) {
        const baseRow = [excelSafeCell(reg.id), excelSafeCell(reg.teamName || '-')];
        if (isTeam) {
          baseRow.push(
            excelSafeCell(reg.representative || '-'),
            excelSafeCell(reg.contact || '-'),
            excelSafeCell(signFor(reg.teamLogoUrl))
          );
        } else {
          baseRow.push(excelSafeCell(reg.contact || '-'));
        }
        baseRow.push(excelSafeCell(reg.paymentStatus || '-'), excelSafeCell(reg.razorpayId || '-'));

        const remainingLength = headers.length - baseRow.length;
        for (let i = 0; i < remainingLength; i++) {
          baseRow.push('-');
        }
        rows.push(baseRow);
      } else {
        reg.players.forEach((player: any) => {
          const row = [
            excelSafeCell(reg.id),
            excelSafeCell(isTeam ? reg.teamName || '-' : player.name || '-'),
          ];

          if (isTeam) {
            row.push(
              excelSafeCell(reg.representative || '-'),
              excelSafeCell(reg.contact || '-'),
              excelSafeCell(signFor(reg.teamLogoUrl))
            );
          } else {
            row.push(excelSafeCell(reg.contact || '-'));
          }

          row.push(excelSafeCell(reg.paymentStatus || '-'), excelSafeCell(reg.razorpayId || '-'));

          if (isTeam) {
            row.push(excelSafeCell(player.name || '-'));
          }

          if (show.email) row.push(excelSafeCell(player.email || '-'));
          if (show.phone) row.push(excelSafeCell(player.phone || '-'));
          if (show.emergencyContact) row.push(excelSafeCell(player.emergencyContact || '-'));
          if (show.dob) row.push(excelSafeCell(player.dob || '-'));
          if (show.age) row.push(excelSafeCell(player.age || '-'));
          if (show.gender) row.push(excelSafeCell(player.gender || '-'));
          if (show.jerseyName) row.push(excelSafeCell(player.jerseyName || '-'));
          if (show.jerseyNumber) row.push(excelSafeCell(player.jerseyNumber || '-'));
          if (show.jerseySize) row.push(excelSafeCell(player.jerseySize || '-'));
          if (show.photo) row.push(excelSafeCell(signFor(player.photo)));

          if (show.sportProfile) {
            row.push(excelSafeCell(player.role || '-'));
            row.push(excelSafeCell(formatSportExportStyleSummary(tournament.sport, player)));
          }

          customLabels.forEach((label: string) => {
            row.push(excelSafeCell(player.customValues?.[label] || '-'));
          });

          rows.push(row);
        });
      }
    });

    const sheetData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);

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
    return (
      <div style={{ color: '#94a3b8', padding: '3rem', textAlign: 'center' }}>
        Loading registrations database...
      </div>
    );
  }

  const paidCollections =
    registrations.filter((r) => r.paymentStatus === 'Paid').length * (Number(tournament.fee) || 0);

  return (
    <div className="animate-fade-in">
      <Link href={backHref} className={styles.backLink}>
        <ArrowLeft size={20} />
        {backLabel}
      </Link>

      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1 className="gradient-text">{tournament.name}</h1>
          <p style={{ color: '#94a3b8' }}>
            Tournament ID: {tournament.id} • {tournament.type}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          {showPreview && tournament.slug && (
            <Link href={`/register/${tournament.slug}`} target="_blank" className="btn-secondary">
              Preview Form
            </Link>
          )}
          <button className="btn-primary" onClick={handleExportExcel}>
            <Download size={20} />
            Export Players to Excel
          </button>
        </div>
      </header>

      <div className={styles.statsGrid}>
        <div className={styles.statBox}>
          <p className={styles.statLabel}>
            Total {tournament.type === 'Team' ? 'Teams' : 'Players'} Registered
          </p>
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
            <span className={styles.statValue}>{paidCollections.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* ── Desktop table ── */}
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
                        src={signedUrls[reg.teamLogoUrl] || reg.teamLogoUrl}
                        alt="Logo"
                        style={{
                          width: '2rem',
                          height: '2rem',
                          borderRadius: '50%',
                          objectFit: 'cover',
                          border: '1px solid rgba(255,255,255,0.08)',
                        }}
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
                  <span
                    className={`${styles.badge} ${
                      reg.paymentStatus === 'Paid' ? styles.badgeSuccess : styles.badgeWarning
                    }`}
                  >
                    {reg.paymentStatus}
                  </span>
                </td>
                <td style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{reg.razorpayId}</td>
              </tr>
            ))}
            {registrations.length === 0 && (
              <tr>
                <td
                  colSpan={tournament.type === 'Team' ? 6 : 4}
                  style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}
                >
                  No registrations found for this tournament.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Mobile cards (hidden on desktop via CSS) ── */}
      <div className={styles.mobileCards}>
        {registrations.length === 0 && (
          <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem 0' }}>
            No registrations found for this tournament.
          </p>
        )}
        {registrations.map((reg) => (
          <div key={reg.id} className={styles.regCard}>
            <div className={styles.regCardHeader}>
              {reg.teamLogoUrl && (
                <img
                  src={signedUrls[reg.teamLogoUrl] || reg.teamLogoUrl}
                  alt="Logo"
                  className={styles.regCardLogo}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className={styles.regCardName}>{reg.teamName || '-'}</p>
                {reg.representative && <p className={styles.regCardSub}>{reg.representative}</p>}
              </div>
              <span
                className={`${styles.badge} ${
                  reg.paymentStatus === 'Paid' ? styles.badgeSuccess : styles.badgeWarning
                }`}
              >
                {reg.paymentStatus}
              </span>
            </div>
            <div className={styles.regCardBody}>
              {reg.contact && (
                <div className={styles.regCardRow}>
                  <span className={styles.regCardLabel}>Contact</span>
                  <span className={styles.regCardValue}>{reg.contact}</span>
                </div>
              )}
              {reg.razorpayId && reg.razorpayId !== '-' && (
                <div className={styles.regCardRow}>
                  <span className={styles.regCardLabel}>Razorpay ID</span>
                  <span
                    className={styles.regCardValue}
                    style={{ fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}
                  >
                    {reg.razorpayId}
                  </span>
                </div>
              )}
              {tournament.type === 'Team' && reg.players?.length > 0 && (
                <div className={styles.regCardRow} style={{ alignItems: 'flex-start' }}>
                  <span className={styles.regCardLabel}>Roster</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    {reg.players.map((p: any, pIdx: number) => (
                      <span key={pIdx} className={styles.regCardValue}>
                        • {p.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
