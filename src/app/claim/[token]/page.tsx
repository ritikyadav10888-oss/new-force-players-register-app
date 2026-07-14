'use client';

import { use, useEffect, useState } from 'react';
import {
  OrphanRegistrationForm,
  type OrphanTournamentMeta,
} from '@/app/admin/orphan-payments/OrphanRegistrationForm';
import registerStyles from '@/app/register/[slug]/register.module.css';

type ClaimData = {
  payment: {
    amountPaise: number;
    currency: string;
    paidAt: string | null;
    paymentId: string | null;
    expiresAt: string | null;
  };
  tournament: OrphanTournamentMeta & {
    id: string;
    name: string;
    theme?: string;
    slug?: string;
  };
  pendingPrefill: Record<string, unknown> | null;
};

export default function ClaimRegistrationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [data, setData] = useState<ClaimData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/claim/${encodeURIComponent(token)}`);
        const json = await res.json();
        if (!res.ok) {
          if (json.alreadyDone) setAlreadyDone(true);
          throw new Error(json.error || 'Unable to open this link');
        }
        if (!cancelled) setData(json as ClaimData);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/claim/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.alreadyDone) {
          setAlreadyDone(true);
          setSuccess(true);
          return;
        }
        throw new Error(json.error || 'Could not save registration');
      }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setBusy(false);
    }
  };

  const theme = data?.tournament.theme || '#6366f1';
  const inr = (paise: number) =>
    `₹${Math.round((Number(paise) || 0) / 100).toLocaleString('en-IN')}`;

  if (loading) {
    return (
      <div className={registerStyles.registerContainer}>
        <div className="container" style={{ padding: '3rem 1rem', textAlign: 'center', color: '#94a3b8' }}>
          Loading…
        </div>
      </div>
    );
  }

  if (success || alreadyDone) {
    return (
      <div className={registerStyles.registerContainer} style={{ '--theme-color': theme } as React.CSSProperties}>
        <div className="container" style={{ padding: '3rem 1rem', maxWidth: 520 }}>
          <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
            <h1 className="gradient-text" style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>
              You&apos;re registered
            </h1>
            <p style={{ color: '#94a3b8', marginTop: '0.75rem', lineHeight: 1.5 }}>
              {alreadyDone && !success
                ? 'This payment was already linked to a registration.'
                : 'Your details were saved and linked to your payment. See you at the tournament.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className={registerStyles.registerContainer}>
        <div className="container" style={{ padding: '3rem 1rem', maxWidth: 520 }}>
          <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>
              Link unavailable
            </h1>
            <p style={{ color: '#f87171', marginTop: '0.75rem' }}>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const tournamentMeta: OrphanTournamentMeta = {
    type: data.tournament.type,
    sport: data.tournament.sport,
    formConfig: data.tournament.formConfig,
    customFields: data.tournament.customFields,
    minPlayers: data.tournament.minPlayers,
    maxPlayers: data.tournament.maxPlayers,
  };

  return (
    <div className={registerStyles.registerContainer} style={{ '--theme-color': theme } as React.CSSProperties}>
      <div className="container" style={{ padding: '2rem 1rem 3rem', maxWidth: 720 }}>
        <header style={{ marginBottom: '1.25rem' }}>
          <h1 className="gradient-text" style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0 }}>
            {data.tournament.name}
          </h1>
          <p style={{ color: '#94a3b8', marginTop: '0.5rem', fontSize: '0.95rem', lineHeight: 1.5 }}>
            Payment received ({inr(data.payment.amountPaise)}). Fill your details below — no extra payment needed.
          </p>
        </header>

        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          {error && (
            <p style={{ color: '#f87171', marginBottom: '0.85rem', fontSize: '0.9rem' }}>{error}</p>
          )}
          <OrphanRegistrationForm
            tournamentId={data.tournament.id}
            tournament={tournamentMeta}
            pendingPrefill={data.pendingPrefill}
            busy={busy}
            submitLabel="Submit registration"
            onSubmit={handleSubmit}
          />
        </div>
      </div>
    </div>
  );
}
