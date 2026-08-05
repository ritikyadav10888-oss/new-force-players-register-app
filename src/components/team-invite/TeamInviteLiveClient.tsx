'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, RefreshCw, Users } from 'lucide-react';
import styles from '@/app/register/[slug]/register.module.css';
import flowStyles from './teamInviteFlow.module.css';

type LivePlayer = { name: string; photoUrl: string | null };

type LiveData = {
  tournamentName: string;
  teamName: string;
  representative: string;
  paymentStatus: string;
  confirmed: boolean;
  playerCount: number;
  maxPlayers: number;
  minPlayers: number;
  players: LivePlayer[];
};

type Props = { slug: string; token: string };

function timeAgoLabel(seconds: number): string {
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  return `${mins}m ago`;
}

export default function TeamInviteLiveClient({ slug, token }: Props) {
  const [data, setData] = useState<LiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await fetch(`/api/team-invites/${encodeURIComponent(token)}/live`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setData(json);
      setError('');
      setLastUpdated(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (loading && !data) {
    return (
      <div className={styles.registerContainer}>
        <div
          className="container"
          style={{
            padding: '6rem 1rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <Loader2 size={28} className="spin" style={{ opacity: 0.6 }} aria-hidden />
          <p style={{ fontSize: '0.9rem', color: '#94a3b8', margin: 0 }}>Loading roster…</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className={styles.registerContainer}>
        <div className="container" style={{ padding: '4rem 1rem', textAlign: 'center' }}>
          <p style={{ color: '#f87171', margin: 0 }}>{error}</p>
          <Link
            href="/"
            style={{
              display: 'inline-block',
              marginTop: '1rem',
              fontSize: '0.85rem',
              textDecoration: 'underline',
              color: '#94a3b8',
            }}
          >
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const payPath = `/register/${slug}/team/${token}/pay`;
  const playerPath = `/register/${slug}/team/${token}`;
  const seatsLeft = Math.max(0, data.maxPlayers - data.playerCount);
  const fillPct = data.maxPlayers > 0 ? Math.min(100, Math.round((data.playerCount / data.maxPlayers) * 100)) : 0;
  const isFull = data.playerCount >= data.maxPlayers && data.maxPlayers > 0;
  const secondsAgo = lastUpdated ? Math.max(0, Math.floor((nowTick - lastUpdated) / 1000)) : null;

  return (
    <div className={styles.registerContainer}>
      <div className={styles.bannerArea}>
        <div className={styles.overlay} />
        <div className={`container ${styles.bannerContent}`}>
          <h1 className={styles.title}>{data.tournamentName}</h1>
          <div className={styles.metaRow}>
            <span className={styles.meta}>
              <Users size={18} aria-hidden /> {data.teamName}
            </span>
            <span className={data.confirmed ? flowStyles.statusConfirmed : flowStyles.statusPending}>
              {data.confirmed ? 'Paid' : 'Awaiting payment'}
            </span>
            <span className={styles.meta}>Rep: {data.representative}</span>
          </div>
        </div>
      </div>

      <div className={`container ${styles.mainContentWrap}`}>
        <div className={`glass-panel animate-fade-in ${styles.card}`}>
          <div className={flowStyles.liveHeader}>
            <div>
              <h2 className={styles.cardTitle} style={{ margin: 0 }}>
                Live roster
              </h2>
              <div className={flowStyles.liveHeaderMeta}>
                <span className={flowStyles.liveDot} aria-hidden />
                <span>
                  {data.confirmed ? 'Updates automatically' : 'Waiting for payment'}
                  {secondsAgo !== null ? ` · Updated ${timeAgoLabel(secondsAgo)}` : ''}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: '0.78rem', padding: '0.45rem 0.75rem' }}
              onClick={() => load(true)}
              disabled={refreshing}
            >
              <RefreshCw
                size={13}
                aria-hidden
                className={refreshing ? 'spin' : undefined}
                style={{ display: 'inline-block', marginRight: '0.35rem' }}
              />
              Refresh
            </button>
          </div>

          <div className={flowStyles.progressWrap}>
            <div className={flowStyles.progressLabelRow}>
              <span className={flowStyles.progressCount}>
                {data.playerCount} / {data.maxPlayers} players
              </span>
              <span className={flowStyles.progressSeats}>
                {isFull ? 'Roster full' : `${seatsLeft} seat${seatsLeft === 1 ? '' : 's'} left`}
              </span>
            </div>
            <div className={flowStyles.progressTrack}>
              <div
                className={`${flowStyles.progressFill} ${isFull ? flowStyles.progressFillFull : ''}`}
                style={{ width: `${fillPct}%` }}
              />
            </div>
          </div>

          {data.players.length === 0 ? (
            <div className={styles.infoSection}>
              <p className={styles.infoBody}>
                {data.confirmed
                  ? 'No other players have joined yet.'
                  : 'Waiting for the representative to register and pay.'}
              </p>
            </div>
          ) : (
            <ul className={flowStyles.playerGrid}>
              {data.players.map((p, i) => (
                <li key={`${p.name}-${i}`} className={flowStyles.playerCard}>
                  {p.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.photoUrl} alt="" className={flowStyles.playerAvatar} />
                  ) : (
                    <div className={flowStyles.playerInitial}>{(p.name || '?').slice(0, 1).toUpperCase()}</div>
                  )}
                  <span className={flowStyles.playerName}>{p.name}</span>
                </li>
              ))}
            </ul>
          )}

          <div className={styles.formActions}>
            {!data.confirmed ? (
              <Link href={payPath} className="btn-primary">
                Representative — fill &amp; pay
              </Link>
            ) : !isFull ? (
              <Link href={playerPath} className="btn-primary">
                Player register link
              </Link>
            ) : null}
            <Link href="/" className="btn-secondary">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
