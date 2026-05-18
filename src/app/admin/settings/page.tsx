'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function SettingsPage() {
  const [tab, setTab] = useState<'password' | 'about'>('password');

  // Change credentials
  const [adminEmail,  setAdminEmail]  = useState('');
  const [newEmail,    setNewEmail]    = useState('');
  const [newPwd,      setNewPwd]      = useState('');
  const [confirmPwd,  setConfirmPwd]  = useState('');
  const [showNew,     setShowNew]     = useState(false);
  const [msg,         setMsg]         = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [userId,      setUserId]      = useState('');

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        setAdminEmail(user.email);
        setNewEmail(user.email);
      }
      if (user?.id) setUserId(user.id);
    };
    fetchUser();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    if (newPwd && newPwd.length < 6) {
      setMsg({ type: 'error', text: 'New password must be at least 6 characters.' });
      return;
    }
    if (newPwd && newPwd !== confirmPwd) {
      setMsg({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    setSaving(true);
    try {
      const updates: any = {};
      if (newEmail.trim() && newEmail.trim() !== adminEmail) {
        updates.email = newEmail.trim();
      }
      if (newPwd) {
        updates.password = newPwd;
      }

      if (Object.keys(updates).length === 0) {
        setMsg({ type: 'error', text: 'No changes provided.' });
        setSaving(false);
        return;
      }

      const { error } = await supabase.auth.updateUser(updates);

      if (error) throw error;

      setMsg({
        type: 'success',
        text: 'Credentials updated successfully in Supabase! If you changed your email, check your inbox to confirm the change.'
      });
      
      if (newPwd) {
        setNewPwd('');
        setConfirmPwd('');
      }
      if (updates.email) {
        setAdminEmail(updates.email);
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to update credentials.' });
    } finally {
      setSaving(false);
    }
  };

  const EyeOpen = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  );
  const EyeOff = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );

  return (
    <>
      <style>{`
        .st-page { padding: 2rem 1.5rem; max-width: 720px; }
        .st-header { margin-bottom: 2.5rem; }
        .st-title { font-size: 1.75rem; font-weight: 800; letter-spacing: -0.025em; color: #f1f5f9; margin-bottom: 0.35rem; }
        .st-sub { color: #64748b; font-size: 0.9rem; }

        .st-tabs { display: flex; gap: 0.25rem; margin-bottom: 2rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 0.625rem; padding: 0.25rem; width: fit-content; }
        .st-tab { padding: 0.5rem 1.25rem; border-radius: 0.4rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; border: none; background: none; color: #64748b; font-family: inherit; transition: all 0.2s; }
        .st-tab.active { background: rgba(99,102,241,0.15); color: #a5b4fc; }
        .st-tab:hover:not(.active) { color: #94a3b8; }

        .st-card { background: rgba(20,22,30,0.8); border: 1px solid rgba(255,255,255,0.07); border-radius: 1rem; padding: 2rem; position: relative; overflow: hidden; }
        .st-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, #6366f1, #c084fc); }
        .st-card-title { font-size: 1.05rem; font-weight: 700; color: #f1f5f9; margin-bottom: 0.3rem; }
        .st-card-sub { font-size: 0.825rem; color: #475569; margin-bottom: 1.75rem; }

        .st-section-label { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #334155; margin-bottom: 0.9rem; padding-bottom: 0.6rem; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .st-field { margin-bottom: 1rem; }
        .st-label { display: block; font-size: 0.78rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.4rem; }
        .st-input-wrap { position: relative; }
        .st-input { width: 100%; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 0.5rem; color: #f1f5f9; padding: 0.75rem 0.9rem; font-size: 0.9rem; font-family: inherit; outline: none; transition: all 0.2s; }
        .st-input::placeholder { color: #334155; }
        .st-input:focus { border-color: rgba(99,102,241,0.5); background: rgba(99,102,241,0.04); box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
        .st-input.has-eye { padding-right: 2.75rem; }
        .st-eye { position: absolute; right: 0.8rem; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #334155; display: flex; padding: 0.25rem; transition: color 0.2s; }
        .st-eye:hover { color: #94a3b8; }

        .st-divider { height: 1px; background: rgba(255,255,255,0.05); margin: 1.5rem 0; }

        .st-msg { display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1rem; border-radius: 0.5rem; font-size: 0.85rem; font-weight: 500; margin-bottom: 1.25rem; animation: fadeUp 0.3s ease; }
        .st-msg.success { background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.2); color: #34d399; }
        .st-msg.error   { background: rgba(239,68,68,0.08);  border: 1px solid rgba(239,68,68,0.2);  color: #f87171; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(-5px); } to { opacity:1; transform:translateY(0); } }

        .st-save { display: inline-flex; align-items: center; gap: 0.5rem; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 0.8rem 1.75rem; border-radius: 0.625rem; font-size: 0.9rem; font-weight: 700; font-family: inherit; border: none; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 16px rgba(99,102,241,0.35); }
        .st-save:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(99,102,241,0.5); }
        .st-save:disabled { opacity: 0.65; cursor: not-allowed; }
        .st-spinner { width: 15px; height: 15px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.65s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* About tab */
        .st-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1.5rem; }
        @media (max-width: 560px) { .st-info-grid { grid-template-columns: 1fr; } }
        .st-info-item { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 0.625rem; padding: 1rem; }
        .st-info-key { font-size: 0.72rem; color: #475569; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 0.3rem; }
        .st-info-val { font-size: 0.9rem; color: #e2e8f0; font-weight: 600; }
      `}</style>

      <div className="st-page">
        <div className="st-header">
          <h1 className="st-title">Settings</h1>
          <p className="st-sub">Manage your admin credentials and account preferences</p>
        </div>

        <div className="st-tabs">
          <button className={`st-tab ${tab === 'password' ? 'active' : ''}`} onClick={() => setTab('password')}>
            🔐 Security
          </button>
          <button className={`st-tab ${tab === 'about' ? 'active' : ''}`} onClick={() => setTab('about')}>
            ℹ️ About
          </button>
        </div>

        {tab === 'password' && (
          <div className="st-card">
            <div className="st-card-title">Change Credentials</div>
            <div className="st-card-sub">Update your admin email address and/or password inside Supabase Auth.</div>

            {msg && (
              <div className={`st-msg ${msg.type}`}>
                {msg.type === 'success' ? '✅' : '❌'} {msg.text}
              </div>
            )}

            <form onSubmit={handleSave}>
              <div className="st-section-label">Account Details</div>

              <div className="st-field">
                <label className="st-label" htmlFor="admin-email">Admin Email Address</label>
                <input
                  id="admin-email"
                  className="st-input"
                  type="email"
                  placeholder="Enter email address"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  required
                />
              </div>

              <div className="st-divider" />
              <div className="st-section-label">Update Security Credentials</div>

              <div className="st-field">
                <label className="st-label" htmlFor="new-pwd">New Password</label>
                <div className="st-input-wrap">
                  <input
                    id="new-pwd"
                    className="st-input has-eye"
                    type={showNew ? 'text' : 'password'}
                    placeholder="Min. 6 characters"
                    value={newPwd}
                    onChange={e => setNewPwd(e.target.value)}
                  />
                  <button type="button" className="st-eye" onClick={() => setShowNew(!showNew)}>
                    {showNew ? <EyeOff /> : <EyeOpen />}
                  </button>
                </div>
              </div>

              <div className="st-field">
                <label className="st-label" htmlFor="conf-pwd">Confirm New Password</label>
                <input
                  id="conf-pwd"
                  className="st-input"
                  type="password"
                  placeholder="Re-enter new password"
                  value={confirmPwd}
                  onChange={e => setConfirmPwd(e.target.value)}
                />
              </div>

              <div style={{ marginTop: '1.5rem' }}>
                <button type="submit" className="st-save" disabled={saving}>
                  {saving ? <><div className="st-spinner" /> Saving…</> : '💾 Save Changes'}
                </button>
              </div>
            </form>
          </div>
        )}

        {tab === 'about' && (
          <div className="st-card">
            <div className="st-card-title">Application Info</div>
            <div className="st-card-sub">Platform details and session information</div>
            <div className="st-info-grid">
              {[
                { key: 'Admin user ID (for SQL)', val: userId || '— sign in to load' },
                { key: 'Platform',        val: 'Force Sports Player Register' },
                { key: 'Version',         val: 'v2.0 · 2026' },
                { key: 'Auth Storage',    val: 'Supabase Authentication' },
                { key: 'Data Storage',    val: 'Supabase PostgreSQL' },
                { key: 'Framework',       val: 'Next.js · App Router' },
                { key: 'Payments',        val: 'Razorpay Integration' },
                { key: 'User Role',       val: 'Must be in admin_users table' },
                { key: 'Session Type',    val: 'Supabase JWT Session' },
              ].map(i => (
                <div key={i.key} className="st-info-item">
                  <div className="st-info-key">{i.key}</div>
                  <div className="st-info-val">{i.val}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
