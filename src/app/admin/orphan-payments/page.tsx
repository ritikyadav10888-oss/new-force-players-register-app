'use client';

import { useState, useEffect } from 'react';
import { adminFetch } from '@/lib/auth/admin-client';
import {
  OrphanRegistrationForm,
  type OrphanTournamentMeta,
} from './OrphanRegistrationForm';

type Orphan = {
  id: string;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
  tournament_id: string;
  tournament_name: string | null;
  amount_paise: number;
  currency: string;
  paid_at: string | null;
  created_at: string;
  has_pending_payload?: boolean;
  tournament?: OrphanTournamentMeta | null;
  pendingPrefill?: Record<string, unknown> | null;
};

export default function OrphanPaymentsPage() {
  const [orphans, setOrphans] = useState<Orphan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminFetch('/api/admin/orphan-payments');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load orphan payments');
      setOrphans(json.orphans || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setOrphans([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleMarkRefunded = async (orphan: Orphan) => {
    if (!confirm(`Mark payment ${orphan.razorpay_payment_id || orphan.id} as refunded/resolved?`)) {
      return;
    }
    setBusyId(orphan.id);
    try {
      const res = await adminFetch('/api/admin/orphan-payments', {
        method: 'PATCH',
        body: JSON.stringify({
          orderId: orphan.id,
          note: 'Refunded / resolved by admin',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to mark resolved');
      setOrphans((prev) => prev.filter((o) => o.id !== orphan.id));
      if (expandedId === orphan.id) setExpandedId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleCopyShareLink = async (orphan: Orphan) => {
    setBusyId(orphan.id);
    try {
      const res = await adminFetch('/api/admin/orphan-payments/claim-link', {
        method: 'PUT',
        body: JSON.stringify({ orderId: orphan.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create share link');
      const url = json.claimUrl as string;
      await navigator.clipboard.writeText(url);
      setCopiedId(orphan.id);
      setTimeout(() => setCopiedId((id) => (id === orphan.id ? null : id)), 2500);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to copy link');
    } finally {
      setBusyId(null);
    }
  };

  const handleCreate = async (orphan: Orphan, payload: Record<string, unknown>) => {
    setBusyId(orphan.id);
    try {
      const res = await adminFetch('/api/admin/orphan-payments', {
        method: 'POST',
        body: JSON.stringify({ orderId: orphan.id, payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create registration');
      alert('Registration created and linked to this payment.');
      setOrphans((prev) => prev.filter((o) => o.id !== orphan.id));
      setExpandedId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusyId(null);
    }
  };

  const inr = (paise: number) => `₹${Math.round((Number(paise) || 0) / 100).toLocaleString('en-IN')}`;

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '3rem' }}>
      <header style={{ marginBottom: '1.75rem' }}>
        <h1 className="gradient-text" style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0 }}>
          Orphan Payments
        </h1>
        <p style={{ color: '#94a3b8', marginTop: '0.4rem', fontSize: '0.9rem' }}>
          Payments captured but never linked to a registration. Share a link so the player fills
          their own details, create the registration yourself, or mark as refunded.
        </p>
      </header>

      {loading ? (
        <p style={{ color: '#94a3b8' }}>Loading…</p>
      ) : error ? (
        <p style={{ color: '#f87171' }}>{error}</p>
      ) : orphans.length === 0 ? (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '0.75rem',
            padding: '2rem',
            color: '#94a3b8',
            textAlign: 'center',
          }}
        >
          No orphan payments. All paid orders are linked to registrations.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {orphans.map((o) => {
            const open = expandedId === o.id;
            const entryType = o.tournament?.type === 'Team' ? 'Team' : 'Individual';
            return (
              <div
                key={o.id}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '0.75rem',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    padding: '1rem 1.15rem',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, color: '#e2e8f0' }}>
                      {o.tournament_name || 'Tournament'}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.25rem' }}>
                      {entryType} entry
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.35rem' }}>
                      Payment: <code style={{ color: '#fcd34d' }}>{o.razorpay_payment_id || '—'}</code>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>
                      Order: {o.razorpay_order_id} · Paid{' '}
                      {o.paid_at ? new Date(o.paid_at).toLocaleString('en-IN') : '—'}
                      {o.has_pending_payload ? ' · Pending form saved' : ''}
                    </div>
                    <div style={{ fontWeight: 700, color: '#34d399', marginTop: '0.45rem' }}>
                      {inr(o.amount_paise)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={busyId === o.id}
                      onClick={() => handleCopyShareLink(o)}
                      style={{ fontSize: '0.85rem', padding: '0.45rem 0.85rem' }}
                    >
                      {copiedId === o.id ? 'Link copied!' : 'Copy share link'}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={busyId === o.id}
                      onClick={() => setExpandedId(open ? null : o.id)}
                      style={{ fontSize: '0.85rem', padding: '0.45rem 0.85rem' }}
                    >
                      {open ? 'Close' : 'Create yourself'}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={busyId === o.id}
                      onClick={() => handleMarkRefunded(o)}
                      style={{ fontSize: '0.85rem', padding: '0.45rem 0.85rem' }}
                    >
                      Mark refunded
                    </button>
                  </div>
                </div>

                {open && (
                  <div
                    style={{
                      borderTop: '1px solid var(--border)',
                      padding: '1rem 1.15rem 1.25rem',
                      background: 'rgba(0,0,0,0.15)',
                    }}
                  >
                    <OrphanRegistrationForm
                      key={o.id}
                      tournamentId={o.tournament_id}
                      tournament={o.tournament ?? null}
                      pendingPrefill={o.pendingPrefill ?? null}
                      busy={busyId === o.id}
                      onSubmit={(payload) => handleCreate(o, payload)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
