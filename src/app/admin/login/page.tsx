'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function AdminLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [shake, setShake]       = useState(false);
  const [mounted, setMounted]   = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: adminRow } = await supabase
          .from('admin_users')
          .select('role')
          .eq('user_id', session.user.id)
          .maybeSingle();
        router.replace(adminRow?.role === 'customer' ? '/customer' : '/admin');
      }
    };
    checkSession();
  }, [router]);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 600);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { data: signInData, error: authError } = await supabase.auth.signInWithPassword({
      email: username.trim(),
      password: password,
    });

    if (!authError && signInData.user) {
      const { data: adminRow } = await supabase
        .from('admin_users')
        .select('user_id, role')
        .eq('user_id', signInData.user.id)
        .maybeSingle();

      if (!adminRow) {
        await supabase.auth.signOut();
        setLoading(false);
        setError('This account does not have access. Please contact the administrator.');
        triggerShake();
        return;
      }

      router.push(adminRow.role === 'customer' ? '/customer' : '/admin');
    } else if (!authError) {
      router.push('/admin');
    } else {
      setLoading(false);
      setError(authError.message || 'Invalid email or password.');
      triggerShake();
    }
  };

  if (!mounted) return null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .lg-root {
          min-height: 100vh;
          background: #09090d;
          font-family: 'Inter', sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem 1rem;
          position: relative;
          overflow: hidden;
        }

        /* Ambient orbs */
        .lg-orb1 {
          position: fixed; border-radius: 50%; pointer-events: none;
          width: 500px; height: 500px;
          background: radial-gradient(circle, rgba(99,102,241,0.16), transparent 65%);
          filter: blur(70px);
          top: -100px; left: -120px;
          animation: floatA 20s infinite alternate ease-in-out;
        }
        .lg-orb2 {
          position: fixed; border-radius: 50%; pointer-events: none;
          width: 450px; height: 450px;
          background: radial-gradient(circle, rgba(192,132,252,0.12), transparent 65%);
          filter: blur(70px);
          bottom: -80px; right: -80px;
          animation: floatB 26s infinite alternate ease-in-out;
        }
        @keyframes floatA { 0% { transform: translate(0,0); } 100% { transform: translate(40px,60px); } }
        @keyframes floatB { 0% { transform: translate(0,0); } 100% { transform: translate(-40px,-50px); } }

        /* Grid overlay */
        .lg-grid {
          position: fixed; inset: 0; pointer-events: none;
          background-image:
            linear-gradient(rgba(99,102,241,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99,102,241,0.03) 1px, transparent 1px);
          background-size: 50px 50px;
          mask-image: radial-gradient(ellipse 70% 70% at 50% 50%, black 20%, transparent 100%);
        }

        /* Card */
        .lg-card {
          position: relative; z-index: 1;
          width: 100%; max-width: 420px;
          background: rgba(18,20,28,0.9);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 1.25rem;
          padding: 2.75rem 2.5rem;
          backdrop-filter: blur(16px);
          overflow: hidden;
        }
        .lg-card::before {
          content: '';
          position: absolute; top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, #6366f1, #c084fc, #f472b6);
        }
        .lg-card.shake {
          animation: shakeAnim 0.5s cubic-bezier(0.36,0.07,0.19,0.97);
        }
        @keyframes shakeAnim {
          0%,100% { transform: translateX(0); }
          15%      { transform: translateX(-8px); }
          30%      { transform: translateX(8px); }
          45%      { transform: translateX(-5px); }
          60%      { transform: translateX(5px); }
          80%      { transform: translateX(-3px); }
        }

        /* Logo */
        .lg-logo {
          display: flex; align-items: center; gap: 0.75rem;
          justify-content: center; margin-bottom: 2rem;
        }
        .lg-logo-icon {
          width: 2.5rem; height: 2.5rem;
          background: linear-gradient(135deg, #6366f1, #c084fc);
          border-radius: 0.5rem;
          display: flex; align-items: center; justify-content: center;
          font-weight: 900; font-size: 1.1rem; color: white;
          box-shadow: 0 0 20px rgba(99,102,241,0.4);
        }
        .lg-logo-text {
          font-size: 1.15rem; font-weight: 800;
          letter-spacing: -0.025em;
          background: linear-gradient(135deg, #818cf8, #c084fc);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .lg-title { font-size: 1.4rem; font-weight: 800; letter-spacing: -0.02em; color: #f1f5f9; text-align: center; margin-bottom: 0.35rem; }
        .lg-sub   { font-size: 0.85rem; color: #475569; text-align: center; margin-bottom: 2rem; }

        /* Error */
        .lg-error {
          display: flex; align-items: center; gap: 0.5rem;
          background: rgba(239,68,68,0.07);
          border: 1px solid rgba(239,68,68,0.18);
          border-radius: 0.5rem;
          padding: 0.65rem 0.9rem;
          font-size: 0.82rem; color: #f87171;
          margin-bottom: 1.25rem;
          animation: fadeSlide 0.25s ease;
        }
        @keyframes fadeSlide { from { opacity:0; transform:translateY(-5px); } to { opacity:1; transform:translateY(0); } }

        /* Field */
        .lg-field { margin-bottom: 1rem; }
        .lg-label { display:block; font-size:0.75rem; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.4rem; }
        .lg-input-wrap { position: relative; }
        .lg-icon { position:absolute; left:0.85rem; top:50%; transform:translateY(-50%); color:#334155; display:flex; pointer-events:none; }
        .lg-input {
          width:100%;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 0.5rem;
          color: #f1f5f9;
          padding: 0.8rem 1rem 0.8rem 2.5rem;
          font-size: 0.9rem; font-family: 'Inter', sans-serif;
          outline: none; transition: all 0.2s;
        }
        .lg-input::placeholder { color: #334155; }
        .lg-input:focus {
          border-color: rgba(99,102,241,0.5);
          background: rgba(99,102,241,0.04);
          box-shadow: 0 0 0 3px rgba(99,102,241,0.1);
        }
        .lg-input.has-eye { padding-right: 2.75rem; }
        .lg-eye {
          position:absolute; right:0.8rem; top:50%; transform:translateY(-50%);
          background:none; border:none; cursor:pointer; color:#334155;
          display:flex; padding:0.25rem; transition:color 0.2s;
        }
        .lg-eye:hover { color:#94a3b8; }

        /* Submit */
        .lg-btn {
          width:100%;
          display:flex; align-items:center; justify-content:center; gap:0.5rem;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color:white; padding:0.875rem;
          border-radius:0.625rem;
          font-size:0.95rem; font-weight:700;
          font-family:'Inter',sans-serif;
          border:none; cursor:pointer;
          transition:all 0.2s;
          box-shadow: 0 4px 18px rgba(99,102,241,0.38);
          margin-top:0.5rem;
        }
        .lg-btn:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 8px 28px rgba(99,102,241,0.52); }
        .lg-btn:disabled { opacity:0.65; cursor:not-allowed; }

        /* Spinner */
        .lg-spin { width:16px; height:16px; border:2.5px solid rgba(255,255,255,0.3); border-top-color:white; border-radius:50%; animation:spin 0.65s linear infinite; }
        @keyframes spin { to { transform:rotate(360deg); } }

        /* Divider */
        .lg-divider { display:flex; align-items:center; gap:0.75rem; margin:1.5rem 0; color:#1e293b; font-size:0.78rem; }
        .lg-divider::before, .lg-divider::after { content:''; flex:1; height:1px; background:rgba(255,255,255,0.05); }

        /* Back link */
        .lg-back {
          display:flex; align-items:center; justify-content:center; gap:0.4rem;
          font-size:0.875rem; color:#475569; font-weight:500;
          text-decoration:none; transition:color 0.2s;
          font-family:'Inter',sans-serif;
        }
        .lg-back:hover { color:#94a3b8; }
      `}</style>

      <div className="lg-root">
        <div className="lg-orb1" />
        <div className="lg-orb2" />
        <div className="lg-grid" />

        <div className={`lg-card ${shake ? 'shake' : ''}`}>

          {/* Logo */}
          <div className="lg-logo">
            <div className="lg-logo-icon">F</div>
            <span className="lg-logo-text">Force Sports Player Register</span>
          </div>

          <div className="lg-title">Admin Sign In</div>
          <div className="lg-sub">Authorized personnel only</div>

          {/* Error */}
          {error && (
            <div className="lg-error">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} autoComplete="off">
            {/* Email */}
            <div className="lg-field">
              <label className="lg-label" htmlFor="lg-user">Email Address</label>
              <div className="lg-input-wrap">
                <span className="lg-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                </span>
                <input
                  id="lg-user"
                  className="lg-input"
                  type="email"
                  placeholder="admin@example.com"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="lg-field">
              <label className="lg-label" htmlFor="lg-pass">Password</label>
              <div className="lg-input-wrap">
                <span className="lg-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </span>
                <input
                  id="lg-pass"
                  className={`lg-input has-eye`}
                  type={showPwd ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button type="button" className="lg-eye" onClick={() => setShowPwd(!showPwd)} tabIndex={-1}>
                  {showPwd ? (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button type="submit" className="lg-btn" disabled={loading}>
              {loading ? (
                <><div className="lg-spin" /> Signing in…</>
              ) : (
                <>
                  Sign In
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </>
              )}
            </button>
          </form>

          <div className="lg-divider">or</div>

          <Link href="/" className="lg-back">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Back to public home
          </Link>
        </div>
      </div>
    </>
  );
}
