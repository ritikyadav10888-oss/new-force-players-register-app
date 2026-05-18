'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ContactPage() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    org: '',
    sport: '',
    message: '',
    teams: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit form.');
      }
      setSubmitted(true);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .ct-root {
          min-height: 100vh;
          background: #0a0b0f;
          font-family: 'Inter', sans-serif;
          color: #f8fafc;
          position: relative;
          overflow-x: hidden;
        }

        /* ── Orbs ── */
        .ct-orb {
          position: fixed;
          border-radius: 50%;
          pointer-events: none;
          filter: blur(80px);
          z-index: 0;
        }
        .ct-orb1 {
          width: 550px; height: 550px;
          background: radial-gradient(circle, rgba(99,102,241,0.18), transparent 65%);
          top: -100px; left: -150px;
          animation: floatA 22s infinite alternate ease-in-out;
        }
        .ct-orb2 {
          width: 500px; height: 500px;
          background: radial-gradient(circle, rgba(192,132,252,0.14), transparent 65%);
          bottom: 0; right: -100px;
          animation: floatB 28s infinite alternate ease-in-out;
        }
        @keyframes floatA {
          0%   { transform: translate(0,0) scale(1); }
          100% { transform: translate(40px, 60px) scale(1.1); }
        }
        @keyframes floatB {
          0%   { transform: translate(0,0) scale(1); }
          100% { transform: translate(-50px,-40px) scale(1.08); }
        }

        /* ── Grid overlay ── */
        .ct-grid {
          position: fixed;
          inset: 0;
          background-image:
            linear-gradient(rgba(99,102,241,0.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99,102,241,0.035) 1px, transparent 1px);
          background-size: 55px 55px;
          mask-image: radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%);
          pointer-events: none;
          z-index: 0;
        }

        /* ── Nav ── */
        .ct-nav {
          position: sticky;
          top: 0;
          z-index: 100;
          background: rgba(10,11,15,0.8);
          backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(255,255,255,0.05);
          padding: 1.1rem 0;
        }
        .ct-nav-inner {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 1.5rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .ct-logo {
          display: flex;
          align-items: center;
          gap: 0.7rem;
          text-decoration: none;
        }
        .ct-logo-icon {
          width: 2.2rem; height: 2.2rem;
          background: linear-gradient(135deg, #6366f1, #c084fc);
          border-radius: 0.5rem;
          display: flex; align-items: center; justify-content: center;
          font-weight: 900; font-size: 1rem; color: white;
          box-shadow: 0 0 16px rgba(99,102,241,0.4);
          flex-shrink: 0;
        }
        .ct-logo-text {
          font-size: 1.05rem; font-weight: 700;
          letter-spacing: -0.02em; color: #f8fafc;
        }
        .ct-back {
          display: inline-flex; align-items: center; gap: 0.4rem;
          font-size: 0.875rem; font-weight: 500; color: #94a3b8;
          text-decoration: none; transition: color 0.2s;
        }
        .ct-back:hover { color: #f8fafc; }

        /* ── Page layout ── */
        .ct-page {
          position: relative;
          z-index: 1;
          max-width: 1200px;
          margin: 0 auto;
          padding: 5rem 1.5rem 6rem;
          display: grid;
          grid-template-columns: 1fr 1.15fr;
          gap: 4rem;
          align-items: start;
        }
        @media (max-width: 860px) {
          .ct-page { grid-template-columns: 1fr; gap: 3rem; padding: 3rem 1rem 4rem; }
        }

        /* ── Left info panel ── */
        .ct-tag {
          display: inline-block;
          font-size: 0.72rem; font-weight: 700;
          letter-spacing: 0.1em; text-transform: uppercase;
          color: #818cf8;
          background: rgba(99,102,241,0.1);
          border: 1px solid rgba(99,102,241,0.2);
          padding: 0.35rem 0.9rem;
          border-radius: 9999px;
          margin-bottom: 1.5rem;
        }
        .ct-headline {
          font-size: clamp(2rem, 5vw, 3.25rem);
          font-weight: 900;
          letter-spacing: -0.04em;
          line-height: 1.1;
          margin-bottom: 1.25rem;
        }
        .ct-headline span {
          background: linear-gradient(135deg, #818cf8 0%, #c084fc 50%, #f472b6 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .ct-subtext {
          color: #64748b;
          font-size: 1rem;
          line-height: 1.7;
          margin-bottom: 3rem;
          max-width: 420px;
        }

        /* ── Contact info cards ── */
        .ct-info-cards {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          margin-bottom: 3rem;
        }
        .ct-info-card {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1.1rem 1.25rem;
          background: rgba(30,33,40,0.55);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 0.875rem;
          transition: all 0.2s;
        }
        .ct-info-card:hover {
          border-color: rgba(99,102,241,0.2);
          background: rgba(30,33,40,0.8);
          transform: translateX(4px);
        }
        .ct-info-icon {
          width: 2.5rem; height: 2.5rem;
          border-radius: 0.625rem;
          display: flex; align-items: center; justify-content: center;
          font-size: 1.1rem;
          flex-shrink: 0;
        }
        .ct-info-label {
          font-size: 0.72rem; color: #475569; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.06em;
          margin-bottom: 0.15rem;
        }
        .ct-info-value {
          font-size: 0.95rem; font-weight: 600; color: #e2e8f0;
        }

        /* ── Features chips ── */
        .ct-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 0.6rem;
        }
        .ct-chip {
          font-size: 0.78rem; font-weight: 600;
          color: #94a3b8;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          padding: 0.4rem 0.9rem;
          border-radius: 9999px;
        }

        /* ── Form card ── */
        .ct-form-card {
          background: rgba(20,22,28,0.8);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 1.25rem;
          padding: 2.5rem;
          backdrop-filter: blur(12px);
          position: relative;
          overflow: hidden;
        }
        .ct-form-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, #6366f1, #c084fc, #f472b6);
        }
        .ct-form-title {
          font-size: 1.35rem; font-weight: 800;
          letter-spacing: -0.025em;
          margin-bottom: 0.4rem; color: #f1f5f9;
        }
        .ct-form-subtitle {
          font-size: 0.875rem; color: #475569;
          margin-bottom: 2rem;
        }

        .ct-grid2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }
        @media (max-width: 560px) { .ct-grid2 { grid-template-columns: 1fr; } }

        .ct-field {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          margin-bottom: 0.25rem;
        }
        .ct-label {
          font-size: 0.78rem; font-weight: 600;
          color: #64748b;
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }
        .ct-input {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          color: #f1f5f9;
          padding: 0.75rem 1rem;
          border-radius: 0.625rem;
          font-size: 0.9rem;
          font-family: 'Inter', sans-serif;
          transition: all 0.2s;
          outline: none;
          width: 100%;
        }
        .ct-input::placeholder { color: #334155; }
        .ct-input:focus {
          border-color: rgba(99,102,241,0.5);
          background: rgba(99,102,241,0.04);
          box-shadow: 0 0 0 3px rgba(99,102,241,0.1);
        }
        select.ct-input option { background: #1e2128; }

        .ct-textarea {
          resize: vertical;
          min-height: 110px;
        }

        .ct-divider {
          height: 1px;
          background: rgba(255,255,255,0.05);
          margin: 1.5rem 0;
        }

        /* ── Submit button ── */
        .ct-submit {
          width: 100%;
          display: flex; align-items: center; justify-content: center;
          gap: 0.6rem;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white;
          padding: 0.95rem 2rem;
          border-radius: 0.75rem;
          font-size: 1rem; font-weight: 700;
          font-family: 'Inter', sans-serif;
          border: none; cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 4px 20px rgba(99,102,241,0.35);
          margin-top: 1.25rem;
        }
        .ct-submit:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 30px rgba(99,102,241,0.5);
        }
        .ct-submit:disabled { opacity: 0.7; cursor: not-allowed; }

        /* ── Spinner ── */
        .ct-spinner {
          width: 18px; height: 18px;
          border: 2.5px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          flex-shrink: 0;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── Success state ── */
        .ct-success {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 3rem 2rem;
          min-height: 400px;
          gap: 1.25rem;
        }
        .ct-success-icon {
          width: 5rem; height: 5rem;
          background: linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05));
          border: 1px solid rgba(16,185,129,0.25);
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 2.2rem;
          animation: popIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        @keyframes popIn {
          0%   { transform: scale(0.5); opacity: 0; }
          100% { transform: scale(1);   opacity: 1; }
        }
        .ct-success-title {
          font-size: 1.5rem; font-weight: 800; color: #f1f5f9;
          letter-spacing: -0.02em;
        }
        .ct-success-msg {
          font-size: 0.95rem; color: #64748b;
          line-height: 1.65; max-width: 320px;
        }
        .ct-success-btn {
          display: inline-flex; align-items: center; gap: 0.5rem;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white; padding: 0.75rem 1.75rem;
          border-radius: 0.625rem; font-size: 0.9rem; font-weight: 700;
          text-decoration: none;
          box-shadow: 0 4px 16px rgba(99,102,241,0.35);
          margin-top: 0.5rem;
          transition: all 0.2s;
        }
        .ct-success-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(99,102,241,0.5); }
      `}</style>

      <div className="ct-root">
        <div className="ct-orb ct-orb1" />
        <div className="ct-orb ct-orb2" />
        <div className="ct-grid" />

        {/* NAV */}
        <nav className="ct-nav">
          <div className="ct-nav-inner">
            <Link href="/" className="ct-logo">
              <div className="ct-logo-icon">F</div>
              <span className="ct-logo-text">Force Sports Player Register</span>
            </Link>
            <Link href="/" className="ct-back">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 5l-7 7 7 7"/>
              </svg>
              Back to Home
            </Link>
          </div>
        </nav>

        <div className="ct-page">

          {/* ── LEFT PANEL ── */}
          <div>
            <div className="ct-tag">📬 Get In Touch</div>
            <h1 className="ct-headline">
              Ready to Run<br />
              Your <span>Tournament?</span>
            </h1>
            <p className="ct-subtext">
              Tell us about your event and we'll help you set up a complete registration
              system — customised forms, Razorpay payments, and a live roster dashboard —
              all ready in minutes.
            </p>

            <div className="ct-info-cards">
              <div className="ct-info-card">
                <div className="ct-info-icon" style={{ background: 'rgba(99,102,241,0.1)' }}>📧</div>
                <div>
                  <div className="ct-info-label">Email Us</div>
                  <div className="ct-info-value">
                    <a href="mailto:info@forcesports.in" style={{ color: 'inherit', textDecoration: 'none' }}>
                      info@forcesports.in
                    </a>
                  </div>
                </div>
              </div>
              <div className="ct-info-card">
                <div className="ct-info-icon" style={{ background: 'rgba(16,185,129,0.1)' }}>📱</div>
                <div>
                  <div className="ct-info-label">WhatsApp</div>
                  <div className="ct-info-value">
                    <a href="https://wa.me/919321058356" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                      +91 93210 58356
                    </a>
                  </div>
                </div>
              </div>
              <div className="ct-info-card">
                <div className="ct-info-icon" style={{ background: 'rgba(245,158,11,0.1)' }}>📍</div>
                <div>
                  <div className="ct-info-label">Locations</div>
                  <div className="ct-info-value">Mumbai, Maharashtra, India</div>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '0.75rem', fontSize: '0.78rem', color: '#475569', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Sports We Support
            </div>
            <div className="ct-chips">
              {['🏏 Cricket', '⚽ Football', '🏀 Basketball', '🏸 Badminton', '🎾 Tennis', '🏐 Volleyball', '🏃 Athletics', '& More'].map(s => (
                <span key={s} className="ct-chip">{s}</span>
              ))}
            </div>
          </div>

          {/* ── FORM CARD ── */}
          <div className="ct-form-card">
            {submitted ? (
              <div className="ct-success">
                <div className="ct-success-icon">✅</div>
                <div className="ct-success-title">Message Received!</div>
                <p className="ct-success-msg">
                  Thanks, <strong>{form.name || 'there'}</strong>! Our team will reach out to you within
                  24 hours to get your tournament set up. 🏆
                </p>
                <Link href="/" className="ct-success-btn">
                  Back to Home
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="ct-form-title">Send us a Message</div>
                <div className="ct-form-subtitle">We typically respond within a few hours</div>

                <div className="ct-grid2">
                  <div className="ct-field">
                    <label className="ct-label">Your Name *</label>
                    <input
                      className="ct-input"
                      name="name"
                      placeholder="Rahul Sharma"
                      value={form.name}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="ct-field">
                    <label className="ct-label">Email Address *</label>
                    <input
                      className="ct-input"
                      name="email"
                      type="email"
                      placeholder="rahul@example.com"
                      value={form.email}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="ct-field">
                    <label className="ct-label">Phone / WhatsApp</label>
                    <input
                      className="ct-input"
                      name="phone"
                      type="tel"
                      placeholder="+91 93210 58356"
                      value={form.phone}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="ct-field">
                    <label className="ct-label">Organisation / Club</label>
                    <input
                      className="ct-input"
                      name="org"
                      placeholder="Mumbai Cricket Club"
                      value={form.org}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="ct-divider" />

                <div className="ct-grid2" style={{ marginBottom: '1rem' }}>
                  <div className="ct-field">
                    <label className="ct-label">Sport *</label>
                    <select
                      className="ct-input"
                      name="sport"
                      value={form.sport}
                      onChange={handleChange}
                      required
                    >
                      <option value="">Select sport…</option>
                      <option>Cricket</option>
                      <option>Football</option>
                      <option>Basketball</option>
                      <option>Badminton</option>
                      <option>Tennis</option>
                      <option>Volleyball</option>
                      <option>Athletics</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div className="ct-field">
                    <label className="ct-label">Expected Teams</label>
                    <select
                      className="ct-input"
                      name="teams"
                      value={form.teams}
                      onChange={handleChange}
                    >
                      <option value="">Select range…</option>
                      <option>1–10 teams</option>
                      <option>10–30 teams</option>
                      <option>30–100 teams</option>
                      <option>100+ teams</option>
                      <option>Individual entries</option>
                    </select>
                  </div>
                </div>

                <div className="ct-field">
                  <label className="ct-label">Tell us about your tournament</label>
                  <textarea
                    className={`ct-input ct-textarea`}
                    name="message"
                    placeholder="Tournament name, date, venue, special requirements…"
                    value={form.message}
                    onChange={handleChange}
                  />
                </div>

                {errorMsg && (
                  <div style={{ padding: '0.8rem 1rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '0.5rem', color: '#f87171', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                    ⚠️ {errorMsg}
                  </div>
                )}

                <button
                  type="submit"
                  className="ct-submit"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <div className="ct-spinner" />
                      Sending…
                    </>
                  ) : (
                    <>
                      Send Message
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 19-7z"/>
                      </svg>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
