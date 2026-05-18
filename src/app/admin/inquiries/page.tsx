'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import styles from '../adminLayout.module.css';

interface Inquiry {
  id: string;
  name: string;
  email: string;
  phone: string;
  organizer: string;
  sport: string;
  expected_teams: string;
  message: string;
  created_at: string;
}

export default function AdminInquiriesPage() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

  const fetchInquiries = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('contact_inquiries')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('⚠️ Table might not exist yet:', error.message);
        setInquiries([]);
      } else {
        setInquiries(data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInquiries();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this inquiry?')) return;
    setDeleteLoading(id);
    try {
      const { error } = await supabase
        .from('contact_inquiries')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setInquiries(prev => prev.filter(item => item.id !== id));
    } catch (err: any) {
      alert(err.message || 'Failed to delete inquiry.');
    } finally {
      setDeleteLoading(null);
    }
  };

  const filteredInquiries = inquiries.filter(item => {
    const q = searchQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      item.email.toLowerCase().includes(q) ||
      item.phone.toLowerCase().includes(q) ||
      (item.organizer && item.organizer.toLowerCase().includes(q)) ||
      (item.sport && item.sport.toLowerCase().includes(q))
    );
  });

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '3rem' }}>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="gradient-text" style={{ fontSize: '2rem', fontWeight: 700 }}>Inquiries</h1>
          <p style={{ color: '#94a3b8', marginTop: '0.5rem' }}>
            Manage lead submissions and contact requests from your registration platform.
          </p>
        </div>
        <button className="btn-primary" onClick={fetchInquiries} disabled={loading} style={{ padding: '0.6rem 1.25rem', fontSize: '0.875rem' }}>
          {loading ? 'Refreshing...' : '🔄 Refresh List'}
        </button>
      </header>

      {/* Search Input */}
      <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '2rem' }}>
        <input
          type="text"
          placeholder="Search by name, email, phone, sport or organizer..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '0.5rem',
            padding: '0.75rem 1rem',
            color: '#f8fafc',
            outline: 'none',
            fontSize: '0.9rem',
          }}
        />
      </div>

      {/* Main Grid */}
      {loading ? (
        <div style={{ padding: '4rem 0', textAlign: 'center', color: '#64748b' }}>
          <div className="ct-spinner" style={{ margin: '0 auto 1.5rem', width: '2rem', height: '2rem', border: '3px solid rgba(99,102,241,0.1)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          Loading inquiries...
        </div>
      ) : filteredInquiries.length === 0 ? (
        <div className="glass-panel" style={{ padding: '5rem 2rem', textAlign: 'center', color: '#475569' }}>
          <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>📬</span>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.25rem' }}>No Inquiries Found</div>
          <div>When visitors submit details on the Contact Us page, they will show up here.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {filteredInquiries.map(item => (
            <div key={item.id} className="glass-panel" style={{ padding: '1.75rem', position: 'relative', borderLeft: '4px solid #6366f1' }}>
              
              {/* Date tag */}
              <div style={{ position: 'absolute', top: '1.75rem', right: '1.75rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>
                  {new Date(item.created_at).toLocaleDateString('en-IN', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                  })}
                </span>
                <button
                  onClick={() => handleDelete(item.id)}
                  disabled={deleteLoading === item.id}
                  style={{
                    background: 'rgba(239,68,68,0.1)',
                    color: '#ef4444',
                    border: 'none',
                    borderRadius: '0.375rem',
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {deleteLoading === item.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>

              {/* Title / Name */}
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f1f5f9', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {item.name}
                {item.organizer && (
                  <span style={{ fontSize: '0.7rem', background: 'rgba(99,102,241,0.12)', color: '#818cf8', padding: '0.25rem 0.6rem', borderRadius: '0.25rem', fontWeight: 600 }}>
                    {item.organizer}
                  </span>
                )}
              </h2>

              {/* Info strip */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.25rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#475569', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Email</div>
                  <div style={{ fontSize: '0.85rem', color: '#a5b4fc', fontWeight: 600 }}>
                    <a href={`mailto:${item.email}`} style={{ color: 'inherit', textDecoration: 'none' }}>{item.email}</a>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#475569', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Phone / WhatsApp</div>
                  <div style={{ fontSize: '0.85rem', color: '#f1f5f9', fontWeight: 600 }}>
                    <a href={`https://wa.me/91${item.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>{item.phone}</a>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#475569', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Sport Support</div>
                  <div style={{ fontSize: '0.85rem', color: '#10b981', fontWeight: 700 }}>{item.sport || 'N/A'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#475569', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Expected Teams</div>
                  <div style={{ fontSize: '0.85rem', color: '#c084fc', fontWeight: 700 }}>{item.expected_teams || 'N/A'}</div>
                </div>
              </div>

              {/* Message */}
              {item.message && (
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#475569', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Message Details</div>
                  <div style={{ background: 'rgba(0,0,0,0.15)', padding: '1rem', borderRadius: '0.5rem', fontSize: '0.85rem', color: '#cbd5e1', lineHeight: 1.6, borderLeft: '3px solid rgba(255,255,255,0.05)', whiteSpace: 'pre-wrap' }}>
                    {item.message}
                  </div>
                </div>
              )}

            </div>
          ))}
        </div>
      )}
    </div>
  );
}
