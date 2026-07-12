'use client';

import { useEffect, useRef, useState } from 'react';
import { UserPlus, Users, Mail, Loader2, ImageIcon, Save, Pencil } from 'lucide-react';
import { adminFetch } from '@/lib/auth/admin-client';

type Customer = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  logo_url: string | null;
  created_at?: string;
};

/** Compress an image file to a small base64 logo (square-ish, ~256px). */
function compressLogo(file: File, callback: (base64: string) => void) {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = (event) => {
    const img = new Image();
    img.src = event.target?.result as string;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX = 256;
      let { width, height } = img;
      if (width > height) {
        if (width > MAX) {
          height *= MAX / width;
          width = MAX;
        }
      } else if (height > MAX) {
        width *= MAX / height;
        height = MAX;
      }
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
      callback(canvas.toDataURL('image/png'));
    };
  };
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  // create form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [logo, setLogo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const logoInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminFetch('/api/admin/customers');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load customers');
      setCustomers(json.customers || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleLogoPick = (e: React.ChangeEvent<HTMLInputElement>, setter: (v: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Logo file exceeds 5MB. Please use a smaller image.');
      return;
    }
    compressLogo(file, setter);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      const res = await adminFetch('/api/admin/customers', {
        method: 'POST',
        body: JSON.stringify({ email, password, displayName, logoUrl: logo }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create customer');
      setSuccess(`Customer ${email} created. They can now log in at /admin/login.`);
      setEmail('');
      setPassword('');
      setDisplayName('');
      setLogo('');
      if (logoInputRef.current) logoInputRef.current.value = '';
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: '760px' }}>
      <h1 className="gradient-text" style={{ fontSize: '1.75rem', marginBottom: '0.35rem' }}>
        Customers
      </h1>
      <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>
        Create login accounts for tournament organizers, and give each their own logo &amp; community name.
        Assign them tournaments from the create/edit pages — they get a branded, read-only dashboard scoped to
        only their own tournaments.
      </p>

      <form
        onSubmit={handleCreate}
        className="glass-panel"
        style={{ padding: '1.5rem', borderRadius: '1rem', marginBottom: '2rem' }}
      >
        <h2 style={sectionTitle}>
          <UserPlus size={18} style={{ color: '#818cf8' }} /> Add a customer
        </h2>

        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="organizer@example.com"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Temporary password</label>
            <input
              type="text"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ marginTop: '1rem' }}>
          <label style={labelStyle}>Community / Organization name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Core Cricket Community"
            style={inputStyle}
          />
        </div>

        <div style={{ marginTop: '1rem' }}>
          <label style={labelStyle}>Logo</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={logoPreviewBox}>
              {logo ? (
                <img src={logo} alt="Logo preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <ImageIcon size={22} style={{ color: '#64748b' }} />
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <label className="btn-secondary" style={{ cursor: 'pointer', padding: '0.5rem 0.9rem' }}>
                Upload logo
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleLogoPick(e, setLogo)}
                  style={{ display: 'none' }}
                />
              </label>
              {logo && (
                <button type="button" className="btn-secondary" style={{ padding: '0.5rem 0.9rem' }} onClick={() => setLogo('')}>
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>

        {error && <p style={{ color: '#f87171', fontSize: '0.85rem', marginTop: '1rem' }}>{error}</p>}
        {success && <p style={{ color: '#34d399', fontSize: '0.85rem', marginTop: '1rem' }}>{success}</p>}

        <button
          type="submit"
          className="btn-primary"
          disabled={submitting}
          style={{ marginTop: '1.25rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
        >
          {submitting ? <Loader2 size={18} className="spin" /> : <UserPlus size={18} />}
          {submitting ? 'Creating…' : 'Create customer'}
        </button>
      </form>

      <h2 style={sectionTitle}>
        <Users size={18} style={{ color: '#818cf8' }} /> Existing customers ({customers.length})
      </h2>

      {loading ? (
        <p style={{ color: '#94a3b8' }}>Loading…</p>
      ) : customers.length === 0 ? (
        <p style={{ color: '#64748b' }}>No customer accounts yet.</p>
      ) : (
        <div style={{ display: 'grid', gap: '0.6rem' }}>
          {customers.map((c) => (
            <CustomerRow key={c.user_id} customer={c} onSaved={load} onLogoPick={handleLogoPick} />
          ))}
        </div>
      )}
    </div>
  );
}

function CustomerRow({
  customer,
  onSaved,
  onLogoPick,
}: {
  customer: Customer;
  onSaved: () => void;
  onLogoPick: (e: React.ChangeEvent<HTMLInputElement>, setter: (v: string) => void) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(customer.display_name || '');
  const [logo, setLogo] = useState(customer.logo_url || '');
  const [saving, setSaving] = useState(false);
  const [rowError, setRowError] = useState('');

  const save = async () => {
    setSaving(true);
    setRowError('');
    try {
      const res = await adminFetch('/api/admin/customers', {
        method: 'PATCH',
        body: JSON.stringify({ userId: customer.user_id, displayName: name, logoUrl: logo }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save');
      setEditing(false);
      onSaved();
    } catch (err: any) {
      setRowError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '0.9rem 1.1rem', borderRadius: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
        <div style={logoPreviewBox}>
          {logo ? (
            <img src={logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <ImageIcon size={20} style={{ color: '#64748b' }} />
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: '#f1f5f9', fontWeight: 600 }}>{customer.display_name || '(no community name)'}</div>
          <div style={{ color: '#94a3b8', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Mail size={13} /> {customer.email || '(no email)'}
          </div>
        </div>
        {!editing && (
          <button className="btn-secondary" style={{ padding: '0.45rem 0.8rem' }} onClick={() => setEditing(true)}>
            <Pencil size={15} /> Edit
          </button>
        )}
      </div>

      {editing && (
        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <label style={labelStyle}>Community / Organization name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="e.g. Core Cricket Community" />

          <label style={{ ...labelStyle, marginTop: '0.85rem' }}>Logo</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={logoPreviewBox}>
              {logo ? (
                <img src={logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <ImageIcon size={20} style={{ color: '#64748b' }} />
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <label className="btn-secondary" style={{ cursor: 'pointer', padding: '0.5rem 0.9rem' }}>
                Upload logo
                <input type="file" accept="image/*" onChange={(e) => onLogoPick(e, setLogo)} style={{ display: 'none' }} />
              </label>
              {logo && (
                <button type="button" className="btn-secondary" style={{ padding: '0.5rem 0.9rem' }} onClick={() => setLogo('')}>
                  Remove
                </button>
              )}
            </div>
          </div>

          {rowError && <p style={{ color: '#f87171', fontSize: '0.82rem', marginTop: '0.75rem' }}>{rowError}</p>}

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button className="btn-primary" onClick={save} disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                setEditing(false);
                setName(customer.display_name || '');
                setLogo(customer.logo_url || '');
                setRowError('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const sectionTitle: React.CSSProperties = {
  fontSize: '1.05rem',
  fontWeight: 700,
  color: '#f1f5f9',
  marginBottom: '1rem',
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.85rem',
  color: '#cbd5e1',
  marginBottom: '0.4rem',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.65rem 0.85rem',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '0.6rem',
  color: '#f1f5f9',
  fontSize: '0.9rem',
};

const logoPreviewBox: React.CSSProperties = {
  width: '3rem',
  height: '3rem',
  borderRadius: '0.6rem',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  flexShrink: 0,
};
