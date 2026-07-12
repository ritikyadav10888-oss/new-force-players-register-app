'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  UserCheck,
  CheckCircle2,
  Wallet,
  Percent,
  TrendingUp,
  Calendar,
  MapPin,
  ChevronRight,
  Trophy,
  Link2,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import styles from './customer.module.css';

type Stat = { regs: number; players: number; paid: number; volume: number };

const RAZORPAY_RATE = 0.03;
const inr = (n: number) => n.toLocaleString('en-IN');

export default function CustomerDashboard() {
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [stats, setStats] = useState<Record<string, Stat>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // RLS limits these to tournaments owned by the signed-in customer
        const { data: tData, error: tErr } = await supabase
          .from('tournaments')
          .select('*')
          .order('created_at', { ascending: false });
        if (tErr) throw tErr;

        const { data: rData, error: rErr } = await supabase
          .from('registrations')
          .select('*, players(*)');
        if (rErr) throw rErr;

        const nextStats: Record<string, Stat> = {};
        (tData || []).forEach((t: any) => {
          const regs = (rData || []).filter((r: any) => r.tournament_id === t.id);
          const paid = regs.filter((r: any) => r.payment_status === 'Paid');
          const players = regs.reduce(
            (sum: number, r: any) => sum + (Array.isArray(r.players) ? r.players.length : 0),
            0
          );
          nextStats[t.id] = {
            regs: regs.length,
            players,
            paid: paid.length,
            volume: paid.length * (Number(t.fee) || 0),
          };
        });

        setTournaments(tData || []);
        setStats(nextStats);
      } catch (err: any) {
        console.error('Failed to load customer dashboard:', err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div style={{ color: '#94a3b8', padding: '3rem', textAlign: 'center' }}>
        Loading your tournaments…
      </div>
    );
  }

  // Aggregate totals across every assigned tournament
  const totals = tournaments.reduce(
    (acc, t) => {
      const s = stats[t.id];
      if (s) {
        acc.players += s.players;
        acc.volume += s.volume;
        acc.paid += s.paid;
      }
      return acc;
    },
    { players: 0, volume: 0, paid: 0 }
  );
  const netTotal = Math.round(totals.volume * (1 - RAZORPAY_RATE));

  return (
    <div className="animate-fade-in">
      <h1 className="gradient-text" style={{ fontSize: '1.9rem', marginBottom: '0.35rem' }}>
        Your Tournaments
      </h1>
      <p style={{ color: '#94a3b8', marginBottom: '1.9rem' }}>
        A live snapshot of registrations and collections for the events assigned to you.
      </p>

      {tournaments.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '3.5rem 1.5rem',
            color: '#94a3b8',
            border: '1px dashed rgba(255,255,255,0.12)',
            borderRadius: '1rem',
            background: 'rgba(255,255,255,0.02)',
          }}
        >
          <Trophy size={34} style={{ color: '#475569', marginBottom: '0.75rem' }} />
          <div style={{ fontWeight: 600, color: '#cbd5e1' }}>No tournaments assigned yet</div>
          <div style={{ fontSize: '0.85rem', marginTop: '0.3rem' }}>
            Once an event is assigned to your account, it will appear here.
          </div>
        </div>
      ) : (
        <>
          {/* ── Summary hero ── */}
          <div className={styles.summaryGrid}>
            <SummaryCard
              icon={<UserCheck size={18} />}
              accent="rgba(192,132,252,0.35)"
              tint="#c084fc"
              value={inr(totals.players)}
              label="Total players"
            />
            <SummaryCard
              icon={<Wallet size={18} />}
              accent="rgba(245,158,11,0.35)"
              tint="#f59e0b"
              value={`₹${inr(totals.volume)}`}
              label="Total collected"
            />
            <SummaryCard
              icon={<TrendingUp size={18} />}
              accent="rgba(52,211,153,0.35)"
              tint="#34d399"
              value={`₹${inr(netTotal)}`}
              label="Net payout (after 3%)"
            />
          </div>

          {/* ── Tournament cards ── */}
          <div className={styles.cardList}>
            {tournaments.map((t) => {
              const s = stats[t.id] || { regs: 0, players: 0, paid: 0, volume: 0 };
              const fee = Math.round(s.volume * RAZORPAY_RATE);
              const net = s.volume - fee;
              const active = t.status === 'Active';
              return (
                <Link key={t.id} href={`/customer/tournaments/${t.id}`} className={styles.card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                    <div style={{ minWidth: 0 }}>
                      <h2 className={styles.cardTitle}>{t.name}</h2>
                      <div className={styles.metaRow}>
                        <span className={styles.metaChip}>
                          <MapPin size={13} /> {t.venue || '—'}
                        </span>
                        <span className={styles.metaChip}>
                          <Calendar size={13} />{' '}
                          {t.registration_deadline
                            ? new Date(t.registration_deadline).toLocaleDateString()
                            : 'TBD'}
                        </span>
                        <span
                          className={styles.statusPill}
                          style={{
                            background: active ? 'rgba(16,185,129,0.15)' : 'rgba(148,163,184,0.15)',
                            color: active ? '#34d399' : '#94a3b8',
                          }}
                        >
                          {t.status}
                        </span>
                      </div>
                    </div>
                    <ChevronRight size={20} className={styles.chevron} style={{ color: '#64748b' }} />
                  </div>

                  <div className={styles.statGrid}>
                    <StatTile
                      icon={<Users size={14} />}
                      tint="#818cf8"
                      value={inr(s.regs)}
                      label={t.type === 'Team' ? 'Teams' : 'Entries'}
                    />
                    <StatTile icon={<UserCheck size={14} />} tint="#c084fc" value={inr(s.players)} label="Players" />
                    <StatTile icon={<CheckCircle2 size={14} />} tint="#34d399" value={inr(s.paid)} label="Paid" />
                    <StatTile icon={<Wallet size={14} />} tint="#f59e0b" value={inr(s.volume)} label="Collected" rupee />
                    <StatTile icon={<Percent size={14} />} tint="#f87171" value={inr(fee)} label="Razorpay fee (3%)" rupee />
                    <StatTile icon={<TrendingUp size={14} />} tint="#34d399" value={inr(net)} label="Net payout" rupee />
                  </div>

                  <RegistrationLinkBar slug={t.slug} />
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function RegistrationLinkBar({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);

  const buildUrl = () =>
    `${typeof window !== 'undefined' ? window.location.origin : ''}/register/${slug}`;

  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleCopy = async (e: React.MouseEvent) => {
    stop(e);
    try {
      await navigator.clipboard.writeText(buildUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className={styles.linkBar}>
      <div className={styles.linkText}>
        <Link2 size={14} style={{ color: '#818cf8', flexShrink: 0 }} />
        <span className={styles.linkUrl}>/register/{slug}</span>
      </div>
      <div className={styles.linkActions}>
        <button type="button" className={styles.linkBtn} onClick={handleCopy}>
          {copied ? <Check size={14} style={{ color: '#34d399' }} /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <a
          href={`/register/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.linkBtn}
          onClick={stop}
        >
          <ExternalLink size={14} /> Open form
        </a>
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  accent,
  tint,
  value,
  label,
}: {
  icon: React.ReactNode;
  accent: string;
  tint: string;
  value: string;
  label: string;
}) {
  return (
    <div className={styles.summaryCard} style={{ ['--accent' as any]: accent }}>
      <div className={styles.summaryIcon} style={{ background: `${tint}22`, color: tint }}>
        {icon}
      </div>
      <div className={styles.summaryValue}>{value}</div>
      <div className={styles.summaryLabel}>{label}</div>
    </div>
  );
}

function StatTile({
  icon,
  tint,
  value,
  label,
  rupee,
}: {
  icon: React.ReactNode;
  tint: string;
  value: string;
  label: string;
  rupee?: boolean;
}) {
  return (
    <div className={styles.statTile}>
      <div className={styles.statTop}>
        <div className={styles.statIcon} style={{ background: `${tint}1f`, color: tint }}>
          {icon}
        </div>
        <span className={styles.statLabel}>{label}</span>
      </div>
      <div className={styles.statValue} style={{ color: tint }}>
        {rupee ? '₹' : ''}
        {value}
      </div>
    </div>
  );
}
