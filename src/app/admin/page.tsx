'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Trophy, Users, IndianRupee, ExternalLink, Trash2, Edit, CheckCircle2, Lock, Copy } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import styles from './dashboard.module.css';

const PG_FEE_RATE = 0.0236;
const PLATFORM_CUT_RATE = 0.0064;

/** One decimal for fee lines (e.g. 35.4, 9.6); whole numbers without trailing .0 */
function formatFeeAmount(amount: number): string {
  const rounded = Math.round(amount * 10) / 10;
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab]     = useState<'Active' | 'Closed'>('Active');
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [liveStats, setLiveStats]     = useState<Record<string, { regs: number; players: number; paid: number; volume: number }>>({});
  const [loading, setLoading] = useState(true);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void } | null>(null);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; title: string; message: string } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: tournamentsData, error: tError } = await supabase
        .from('tournaments')
        .select('*')
        .order('created_at', { ascending: false });

      if (tError) throw tError;

      const { data: registrationsData, error: rError } = await supabase
        .from('registrations')
        .select('*, players(*)');

      if (rError) throw rError;

      const mappedTournaments = (tournamentsData || []).map((t: any) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        type: t.type,
        venue: t.venue,
        fee: t.fee,
        maxPlayers: t.max_players,
        theme: t.theme,
        description: t.description,
        registrationDeadline: t.registration_deadline,
        rules: t.rules,
        organizerName: t.organizer_name,
        organizerPhone: t.organizer_phone,
        terms: t.terms,
        status: t.status,
        isPublic: t.is_public !== false,
        customFields: t.custom_fields,
        formConfig: t.form_config,
      }));

      setTournaments(mappedTournaments);

      // Build live stats for every tournament
      const stats: Record<string, { regs: number; players: number; paid: number; volume: number }> = {};
      mappedTournaments.forEach((t: any) => {
        const regs = registrationsData?.filter((r: any) => r.tournament_id === t.id) || [];
        const paid = regs.filter((r: any) => r.payment_status === 'Paid');
        const volume = paid.length * (Number(t.fee) || 0);
        
        const playersCount = regs.reduce((sum: number, r: any) => {
          return sum + (Array.isArray(r.players) ? r.players.length : 0);
        }, 0);

        stats[t.id] = {
          regs: regs.length,
          players: playersCount,
          paid: paid.length,
          volume,
        };
      });
      setLiveStats(stats);
    } catch (err: any) {
      console.error('Error fetching dashboard data:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Tournament',
      message: 'Are you sure you want to delete this tournament and all its registrations? This action cannot be undone.',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const { error } = await supabase.from('tournaments').delete().eq('id', id);
          if (error) throw error;
          setTournaments(prev => prev.filter(t => t.id !== id));
          setAlertModal({
            isOpen: true,
            title: 'Success',
            message: 'Tournament successfully deleted!'
          });
        } catch (err: any) {
          setAlertModal({
            isOpen: true,
            title: 'Error',
            message: 'Failed to delete tournament: ' + err.message
          });
        }
      }
    });
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'Active' ? 'Closed' : 'Active';
    const confirmMsg = currentStatus === 'Active' 
      ? 'Are you sure you want to mark this tournament as Completed (Closed)?' 
      : 'Are you sure you want to reactivate this tournament?';

    setConfirmModal({
      isOpen: true,
      title: currentStatus === 'Active' ? 'Complete Tournament' : 'Reactivate Tournament',
      message: confirmMsg,
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const { error } = await supabase
            .from('tournaments')
            .update({ status: newStatus })
            .eq('id', id);
          if (error) throw error;
          
          // Update tournaments list state
          setTournaments(prev => prev.map(t => t.id === id ? { ...t, status: newStatus } : t));
          
          // Auto-switch tab to let admin see exactly where the card moved!
          setActiveTab(newStatus);

          setAlertModal({
            isOpen: true,
            title: 'Status Updated',
            message: newStatus === 'Closed'
              ? 'Tournament successfully marked as Completed! It has moved to the "Closed Tournaments" tab, and public registration is now CLOSED.'
              : 'Tournament successfully Reactivated! It has moved back to the "Active Tournaments" tab, and public registration is now OPEN.'
          });

        } catch (err: any) {
          setAlertModal({
            isOpen: true,
            title: 'Error',
            message: 'Failed to update tournament status: ' + err.message
          });
        }
      }
    });
  };

  // ── Aggregated totals ──────────────────────────────────────────────────────
  const activeTournaments = tournaments.filter(t => t.status === 'Active');
  const totalTeams        = Object.values(liveStats).reduce((s, v) => s + v.regs, 0);
  const totalPlayers      = Object.values(liveStats).reduce((s, v) => s + v.players, 0);
  const totalVolume       = Object.values(liveStats).reduce((s, v) => s + v.volume, 0);

  const filteredTournaments = tournaments.filter(t => t.status === activeTab);

  return (
    <div className="animate-fade-in">
      {/* ── Header ── */}
      <header className={styles.header}>
        <div>
          <h1 className="gradient-text" style={{ fontSize: '2rem', fontWeight: 700 }}>Dashboard</h1>
          <p style={{ color: '#94a3b8', marginTop: '0.5rem' }}>
            Live overview of all your tournaments and registrations.
          </p>
        </div>
        <Link href="/admin/tournaments/create" className="btn-primary">
          + Create Tournament
        </Link>
      </header>

      {/* ── Live Stats Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '2.5rem' }}>

        {/* Active Tournaments */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ width: '3rem', height: '3rem', borderRadius: '0.625rem', background: 'rgba(99,102,241,0.12)', color: '#818cf8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Trophy size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Active Tournaments</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#f1f5f9', lineHeight: 1.2 }}>{activeTournaments.length}</div>
            <div style={{ fontSize: '0.72rem', color: '#475569' }}>{tournaments.length} total</div>
          </div>
        </div>

        {/* Teams / Entries Registered */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ width: '3rem', height: '3rem', borderRadius: '0.625rem', background: 'rgba(59,130,246,0.12)', color: '#60a5fa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Teams Registered</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#f1f5f9', lineHeight: 1.2 }}>{totalTeams}</div>
            <div style={{ fontSize: '0.72rem', color: '#475569' }}>across all tournaments</div>
          </div>
        </div>

        {/* Total Players */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ width: '3rem', height: '3rem', borderRadius: '0.625rem', background: 'rgba(192,132,252,0.12)', color: '#c084fc', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Users size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Players</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#f1f5f9', lineHeight: 1.2 }}>{totalPlayers}</div>
            <div style={{ fontSize: '0.72rem', color: '#475569' }}>individual registrants</div>
          </div>
        </div>

      </div>

      {/* ── Tabs ── */}
      <div className={styles.tabsContainer}>
        <button className={`${styles.tab} ${activeTab === 'Active' ? styles.activeTab : ''}`} onClick={() => setActiveTab('Active')}>
          Active Tournaments
        </button>
        <button className={`${styles.tab} ${activeTab === 'Closed' ? styles.activeTab : ''}`} onClick={() => setActiveTab('Closed')}>
          Closed Tournaments
        </button>
      </div>

      {/* ── Tournament Cards ── */}
      <div className={styles.tournamentsList}>
        {filteredTournaments.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No {activeTab.toLowerCase()} tournaments found.</p>
            {activeTab === 'Active' && (
              <Link href="/admin/tournaments/create" className="btn-primary" style={{ marginTop: '1rem', display: 'inline-flex' }}>
                Create Your First Tournament
              </Link>
            )}
          </div>
        ) : (
          filteredTournaments.map(tournament => {
            const s = liveStats[tournament.id] || { regs: 0, players: 0, paid: 0, volume: 0 };
            const paidPct = s.regs > 0 ? Math.round((s.paid / s.regs) * 100) : 0;
            const pgFee = s.volume * PG_FEE_RATE;
            const platformCut = s.volume * PLATFORM_CUT_RATE;
            const netToOrganiser = s.volume - pgFee - platformCut;

            return (
              <div key={tournament.id} className={`glass-panel ${styles.tournamentCard}`}>
                <div className={styles.tCardHeader}>
                  <div>
                    <h3 className={styles.tName}>{tournament.name}</h3>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                      <span className={styles.badge} style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8' }}>
                        {tournament.type}
                      </span>
                      <span className={styles.badge} style={{ background: tournament.status === 'Active' ? 'rgba(16,185,129,0.1)' : 'rgba(100,116,139,0.1)', color: tournament.status === 'Active' ? '#34d399' : '#64748b' }}>
                        {tournament.status}
                      </span>
                      {tournament.isPublic === false && (
                        <span
                          className={styles.badge}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            background: 'rgba(148,163,184,0.12)',
                            color: '#94a3b8',
                          }}
                          title="Hidden from public homepage"
                        >
                          <Lock size={12} strokeWidth={2.5} aria-hidden />
                          Private
                        </span>
                      )}
                      {tournament.fee && (
                        <span className={styles.badge} style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
                          ₹{Number(tournament.fee).toLocaleString('en-IN')} entry
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <button 
                      className="btn-secondary" 
                      onClick={() => handleToggleStatus(tournament.id, tournament.status)} 
                      style={{ 
                        padding: '0.5rem 0.75rem', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.4rem', 
                        borderColor: tournament.status === 'Active' ? 'rgba(16,185,129,0.3)' : 'rgba(99,102,241,0.3)', 
                        color: tournament.status === 'Active' ? '#34d399' : '#818cf8' 
                      }} 
                      title={tournament.status === 'Active' ? 'Mark Completed' : 'Reactivate'}
                    >
                      <CheckCircle2 size={16} />
                      <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                        {tournament.status === 'Active' ? 'Complete' : 'Reactivate'}
                      </span>
                    </button>
                    <Link href={`/admin/tournaments/edit/${tournament.id}`} className="btn-secondary" style={{ padding: '0.5rem', display: 'flex', alignItems: 'center' }} title="Edit">
                      <Edit size={16} />
                    </Link>
                    <button className="btn-secondary" onClick={() => handleDelete(tournament.id)} style={{ padding: '0.5rem', display: 'flex', alignItems: 'center', borderColor: 'rgba(239,68,68,0.2)', color: '#ef4444' }} title="Delete">
                      <Trash2 size={16} />
                    </button>
                    <Link href={`/admin/tournaments/${tournament.id}`} className="btn-secondary" style={{ padding: '0.5rem 1rem' }}>
                      View Details
                    </Link>
                  </div>
                </div>

                {/* ── Live registration stats per tournament ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem', margin: '1.25rem 0', padding: '1.25rem', background: 'rgba(255,255,255,0.02)', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f1f5f9' }}>{s.regs}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                      {tournament.type === 'Team' ? 'Teams' : 'Entries'} Registered
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#c084fc' }}>{s.players}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Players Enrolled</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#34d399' }}>{s.paid}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Paid Entries</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f59e0b' }}>₹{s.volume.toLocaleString('en-IN')}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Collected</div>
                  </div>
                </div>

                {/* Payment progress bar */}
                {s.regs > 0 && (
                  <div style={{ marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b', marginBottom: '0.4rem' }}>
                      <span>Payment completion</span>
                      <span style={{ color: '#34d399', fontWeight: 600 }}>{paidPct}% paid</span>
                    </div>
                    <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '9999px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${paidPct}%`, background: 'linear-gradient(90deg, #10b981, #34d399)', borderRadius: '9999px', transition: 'width 0.5s ease' }} />
                    </div>
                  </div>
                )}

                {/* Revenue Breakdown */}
                <div className={styles.revenueBreakdown}>
                  <div className={styles.revenueItem}>
                    <p className={styles.revLabel}>Total Collected</p>
                    <p className={styles.revValue}>₹{s.volume.toLocaleString('en-IN')}</p>
                  </div>
                  <div className={styles.revenueItem}>
                    <p className={styles.revLabel}>PG Fee (2.36%)</p>
                    <p className={styles.revValue} style={{ color: '#ef4444' }}>-₹{formatFeeAmount(pgFee)}</p>
                  </div>
                  <div className={styles.revenueItem}>
                    <p className={styles.revLabel}>Platform Cut (0.64%)</p>
                    <p className={styles.revValue} style={{ color: '#ef4444' }}>-₹{formatFeeAmount(platformCut)}</p>
                  </div>
                  <div className={`${styles.revenueItem} ${styles.revNet}`}>
                    <p className={styles.revLabel}>Net to Organiser</p>
                    <p className={styles.revValue} style={{ color: '#34d399', fontSize: '1.1rem' }}>₹{formatFeeAmount(netToOrganiser)}</p>
                  </div>
                </div>

                <div className={styles.tFooter}>
                  <div className={styles.publicLink}>
                    <Link href={`/register/${tournament.slug}`} target="_blank" className={styles.linkText}>
                      /register/{tournament.slug}
                    </Link>
                    <button className={styles.iconBtn} title="Copy Link" onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/register/${tournament.slug}`);
                      setAlertModal({
                        isOpen: true,
                        title: 'Link Copied',
                        message: 'Registration link copied to clipboard successfully!'
                      });
                    }}>
                      <ExternalLink size={15} />
                    </button>
                  </div>
                  
                  <div className={styles.publicLink} style={{ marginLeft: 'auto', background: 'rgba(99,102,241,0.05)' }}>
                    <span className={styles.linkText} style={{ fontFamily: 'monospace', color: '#818cf8' }}>
                      ID: {tournament.id.substring(0, 8)}...
                    </span>
                    <button className={styles.iconBtn} title="Copy Tournament ID" onClick={() => {
                      navigator.clipboard.writeText(tournament.id);
                      setAlertModal({
                        isOpen: true,
                        title: 'Tournament ID Copied',
                        message: 'Tournament ID copied to clipboard! You can now paste it into the Scoring Engine.'
                      });
                    }}>
                      <Copy size={15} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* CUSTOM CONFIRMATION MODAL */}
      {confirmModal && confirmModal.isOpen && (
        <div
          onClick={() => setConfirmModal(null)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: '1.5rem',
            animation: 'fadeIn 0.15s ease'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#1a2235',
              border: `1px solid ${confirmModal.title.includes('Delete') ? 'rgba(239,68,68,0.3)' : 'rgba(99,102,241,0.3)'}`,
              boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
              borderRadius: '1.1rem',
              width: '100%', maxWidth: '420px',
              padding: '2rem',
              textAlign: 'center',
              animation: 'slideUp 0.18s ease'
            }}
          >
            {/* Icon */}
            <div style={{
              width: '56px', height: '56px', borderRadius: '50%',
              background: confirmModal.title.includes('Delete') ? 'rgba(239,68,68,0.12)' : 'rgba(99,102,241,0.12)',
              border: `1px solid ${confirmModal.title.includes('Delete') ? 'rgba(239,68,68,0.25)' : 'rgba(99,102,241,0.25)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1.25rem',
              fontSize: '1.6rem'
            }}>
              {confirmModal.title.includes('Delete') ? '🗑️' : confirmModal.title.includes('Complete') ? '✅' : '🔄'}
            </div>

            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '0.6rem' }}>
              {confirmModal.title}
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: '1.65', marginBottom: '1.75rem' }}>
              {confirmModal.message}
            </p>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                style={{
                  flex: 1, padding: '0.65rem 1rem', borderRadius: '0.6rem',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#94a3b8', fontWeight: 600, fontSize: '0.9rem',
                  cursor: 'pointer', transition: 'background 0.15s'
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.09)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                style={{
                  flex: 1, padding: '0.65rem 1rem', borderRadius: '0.6rem',
                  background: confirmModal.title.includes('Delete') ? '#dc2626' : '#6366f1',
                  border: 'none', color: 'white',
                  fontWeight: 700, fontSize: '0.9rem',
                  cursor: 'pointer', transition: 'opacity 0.15s',
                  boxShadow: confirmModal.title.includes('Delete') ? '0 4px 14px rgba(220,38,38,0.35)' : '0 4px 14px rgba(99,102,241,0.35)'
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                {confirmModal.title.includes('Delete') ? 'Yes, Delete' : 'Yes, Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM ALERT MODAL */}
      {alertModal && alertModal.isOpen && (
        <div
          onClick={() => setAlertModal(null)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: '1.5rem',
            animation: 'fadeIn 0.15s ease'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#1a2235',
              border: `1px solid ${alertModal.title.includes('Error') ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
              boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
              borderRadius: '1.1rem',
              width: '100%', maxWidth: '400px',
              padding: '2rem',
              textAlign: 'center',
              animation: 'slideUp 0.18s ease'
            }}
          >
            <div style={{
              fontSize: '2.5rem', marginBottom: '1rem', lineHeight: 1
            }}>
              {alertModal.title.includes('Error') ? '❌' : '✅'}
            </div>
            <h3 style={{
              fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.5rem',
              color: alertModal.title.includes('Error') ? '#f87171' : '#34d399'
            }}>
              {alertModal.title}
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: '1.65', marginBottom: '1.75rem' }}>
              {alertModal.message}
            </p>
            <button
              type="button"
              onClick={() => setAlertModal(null)}
              style={{
                padding: '0.65rem 2.5rem', borderRadius: '0.6rem',
                background: alertModal.title.includes('Error') ? '#dc2626' : '#10b981',
                border: 'none', color: 'white',
                fontWeight: 700, fontSize: '0.9rem',
                cursor: 'pointer', transition: 'opacity 0.15s'
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
