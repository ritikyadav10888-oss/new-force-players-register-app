'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, RefreshCw, Users } from 'lucide-react';
import styles from '@/app/register/[slug]/register.module.css';
import '@/app/register/register-shell.css';
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

export default function TeamInviteLiveClient({ slug, token }: Props) {
  const [data, setData] = useState<LiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/team-invites/${encodeURIComponent(token)}/live`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setData(json);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  if (loading && !data) {
    return (
      <div className={`${styles.registerContainer} register-shell`}>
        <div className="container py-24 flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin opacity-60" />
          <p className="text-sm opacity-70">Loading roster…</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className={`${styles.registerContainer} register-shell`}>
        <div className="container py-16 text-center">
          <p className="text-red-600">{error}</p>
          <Link href="/" className="inline-block mt-4 text-sm underline">
            Home
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const payPath = `/register/${slug}/team/${token}/pay`;
  const playerPath = `/register/${slug}/team/${token}`;

  return (
    <div className={`${styles.registerContainer} register-shell`}>
      <div className={styles.bannerArea}>
        <div className={styles.overlay} />
        <div className={`container ${styles.bannerContent}`}>
          <h1 className={styles.title}>{data.tournamentName}</h1>
          <div className={styles.metaRow}>
            <span className={styles.meta}>
              <Users size={18} aria-hidden /> {data.teamName}
            </span>
            <span className={styles.meta}>
              <Users size={18} aria-hidden /> {data.playerCount}/{data.maxPlayers} Players
            </span>
            <span className={styles.meta}>
              {data.confirmed ? 'Paid' : 'Awaiting payment'} · Rep: {data.representative}
            </span>
          </div>
        </div>
      </div>

      <div className={`container ${styles.mainContentWrap}`}>
        <div className={`glass-panel animate-fade-in ${styles.card}`}>
          <div className={`${styles.playersHeader} ${styles.playersHeaderBar}`}>
            <div className={styles.playersStepHeader}>
              <h2 className={styles.cardTitle} style={{ margin: 0 }}>
                Live roster
              </h2>
              <p className={styles.playersStepSubtitle}>
                {data.confirmed
                  ? 'Team is paid. Watch players join the live roster.'
                  : 'Representative pays first. Player register opens after payment.'}
              </p>
            </div>
            <button type="button" className="btn-secondary text-xs" onClick={() => load()}>
              <RefreshCw className="w-3 h-3 inline mr-1" />
              Refresh
            </button>
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
                    <div className={`${flowStyles.playerInitial} font-display uppercase`}>
                      {(p.name || '?').slice(0, 1)}
                    </div>
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
            ) : data.playerCount < data.maxPlayers ? (
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
