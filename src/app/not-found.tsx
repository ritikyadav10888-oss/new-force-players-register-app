'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function NotFound() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .nf-root {
          min-height: 100vh;
          background: #0a0b0f;
          font-family: 'Inter', sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
          color: #f8fafc;
          text-align: center;
          padding: 2rem;
        }

        /* ── Ambient orbs ── */
        .orb {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          filter: blur(70px);
          opacity: 0;
          animation: orbFadeIn 1.2s forwards;
        }
        .orb1 {
          width: 500px; height: 500px;
          background: radial-gradient(circle, rgba(99,102,241,0.22), transparent 65%);
          top: -120px; left: -100px;
          animation-delay: 0.1s;
          animation: orbFadeIn 1.2s 0.1s forwards, floatOrb1 20s 1.3s infinite alternate ease-in-out;
        }
        .orb2 {
          width: 600px; height: 600px;
          background: radial-gradient(circle, rgba(192,132,252,0.16), transparent 65%);
          bottom: -150px; right: -120px;
          animation: orbFadeIn 1.2s 0.3s forwards, floatOrb2 25s 1.5s infinite alternate ease-in-out;
        }
        .orb3 {
          width: 300px; height: 300px;
          background: radial-gradient(circle, rgba(16,185,129,0.1), transparent 65%);
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          animation: orbFadeIn 1.2s 0.5s forwards, pulse 4s 1.7s infinite ease-in-out;
        }

        @keyframes orbFadeIn {
          to { opacity: 1; }
        }
        @keyframes floatOrb1 {
          0% { transform: translate(0, 0) scale(1); }
          100% { transform: translate(40px, 60px) scale(1.1); }
        }
        @keyframes floatOrb2 {
          0% { transform: translate(0, 0) scale(1); }
          100% { transform: translate(-50px, -40px) scale(1.08); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.6; transform: translate(-50%, -50%) scale(1); }
          50%       { opacity: 1;   transform: translate(-50%, -50%) scale(1.15); }
        }

        /* ── Grid overlay ── */
        .grid-overlay {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(99,102,241,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99,102,241,0.04) 1px, transparent 1px);
          background-size: 50px 50px;
          mask-image: radial-gradient(ellipse 80% 80% at 50% 50%, black 20%, transparent 100%);
          pointer-events: none;
        }

        /* ── Content ── */
        .content {
          position: relative;
          z-index: 10;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0;
          opacity: 0;
          transform: translateY(20px);
          animation: riseIn 0.8s 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }

        @keyframes riseIn {
          to { opacity: 1; transform: translateY(0); }
        }

        /* ── Big 404 number ── */
        .num404 {
          font-size: clamp(7rem, 20vw, 14rem);
          font-weight: 900;
          line-height: 1;
          letter-spacing: -0.05em;
          background: linear-gradient(135deg, #818cf8 0%, #c084fc 40%, #f472b6 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          position: relative;
          margin-bottom: -0.5rem;
          animation: glitch 5s 2s infinite;
        }

        @keyframes glitch {
          0%, 92%, 100% {
            text-shadow: none;
            transform: none;
          }
          93% {
            transform: skewX(-8deg) translateX(-3px);
            text-shadow: 4px 0 rgba(192,132,252,0.7), -4px 0 rgba(99,102,241,0.7);
          }
          94% {
            transform: skewX(5deg) translateX(3px);
            text-shadow: -3px 0 rgba(244,114,182,0.7), 3px 0 rgba(99,102,241,0.7);
          }
          95% {
            transform: none;
            text-shadow: none;
          }
          96% {
            transform: skewX(-3deg) translateX(-2px);
            text-shadow: 2px 0 rgba(192,132,252,0.5);
          }
          97% {
            transform: none;
            text-shadow: none;
          }
        }

        /* ── Ball emoji bouncing ── */
        .ball {
          font-size: 3.5rem;
          display: block;
          margin-bottom: 1.5rem;
          animation: bounce 1.8s 0.8s cubic-bezier(0.36, 0.07, 0.19, 0.97) infinite;
          transform-origin: center bottom;
        }

        @keyframes bounce {
          0%, 100% { transform: translateY(0) scaleX(1) scaleY(1); }
          30%       { transform: translateY(-28px) scaleX(0.95) scaleY(1.05); }
          50%       { transform: translateY(0) scaleX(1.08) scaleY(0.92); }
          65%       { transform: translateY(-12px) scaleX(0.97) scaleY(1.03); }
          80%       { transform: translateY(0) scaleX(1.04) scaleY(0.96); }
        }

        /* ── Tag / badge ── */
        .tag {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #818cf8;
          background: rgba(99,102,241,0.1);
          border: 1px solid rgba(99,102,241,0.2);
          padding: 0.35rem 1rem;
          border-radius: 9999px;
          margin-bottom: 1.25rem;
        }

        .heading {
          font-size: clamp(1.5rem, 4vw, 2.5rem);
          font-weight: 800;
          letter-spacing: -0.025em;
          margin-bottom: 1rem;
          color: #f1f5f9;
        }

        .sub {
          color: #64748b;
          font-size: 1.05rem;
          max-width: 460px;
          line-height: 1.65;
          margin-bottom: 2.5rem;
        }

        /* ── Buttons ── */
        .btnGroup {
          display: flex;
          gap: 1rem;
          justify-content: center;
          flex-wrap: wrap;
        }

        .btnPrimary {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white;
          padding: 0.85rem 2rem;
          border-radius: 0.625rem;
          font-size: 0.95rem;
          font-weight: 700;
          text-decoration: none;
          transition: all 0.2s;
          box-shadow: 0 4px 20px rgba(99,102,241,0.4);
          font-family: 'Inter', sans-serif;
        }
        .btnPrimary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 28px rgba(99,102,241,0.55);
        }

        .btnSecondary {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          color: #cbd5e1;
          padding: 0.85rem 2rem;
          border-radius: 0.625rem;
          font-size: 0.95rem;
          font-weight: 600;
          text-decoration: none;
          transition: all 0.2s;
          font-family: 'Inter', sans-serif;
        }
        .btnSecondary:hover {
          background: rgba(255,255,255,0.08);
          border-color: rgba(255,255,255,0.18);
        }

        /* ── Divider line ── */
        .divider {
          width: 60px;
          height: 3px;
          background: linear-gradient(90deg, #6366f1, #c084fc);
          border-radius: 9999px;
          margin: 0 auto 2rem;
          opacity: 0;
          animation: riseIn 0.6s 1s forwards;
        }

        /* ── Quick nav links ── */
        .quickLinks {
          margin-top: 3rem;
          display: flex;
          gap: 0.5rem 2rem;
          justify-content: center;
          flex-wrap: wrap;
          opacity: 0;
          animation: riseIn 0.6s 1.2s forwards;
        }

        .quickLink {
          font-size: 0.82rem;
          color: #475569;
          text-decoration: none;
          display: flex;
          align-items: center;
          gap: 0.3rem;
          transition: color 0.2s;
          font-family: 'Inter', sans-serif;
        }
        .quickLink:hover { color: #818cf8; }

        /* ── Copyright ── */
        .copy {
          position: absolute;
          bottom: 1.5rem;
          font-size: 0.8rem;
          color: #1e293b;
          font-family: 'Inter', sans-serif;
        }
      `}</style>

      <div className="nf-root">
        {/* Ambient background */}
        <div className="orb orb1" />
        <div className="orb orb2" />
        <div className="orb orb3" />
        <div className="grid-overlay" />

        {/* Main content */}
        <div className="content">
          <span className="ball">🏏</span>

          <div className="tag">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <circle cx="5" cy="5" r="5"/>
            </svg>
            Error 404
          </div>

          <div className="num404">404</div>

          <div className="divider" />

          <h1 className="heading">Page Not Found</h1>

          <p className="sub">
            Looks like this page got caught in a yorker — it&apos;s out of the crease!
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>

          <div className="btnGroup">
            <Link href="/" className="btnPrimary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
              Back to Home
            </Link>
            <Link href="/admin" className="btnSecondary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
              </svg>
              Admin Panel
            </Link>
          </div>

          <div className="quickLinks">
            <Link href="/#tournaments" className="quickLink">
              🏟️ Open Tournaments
            </Link>
            <Link href="/admin/tournaments/create" className="quickLink">
              ➕ Create Tournament
            </Link>
            <Link href="/#how-it-works" className="quickLink">
              ❓ How It Works
            </Link>
          </div>
        </div>

        <div className="copy">© 2026 Force Sports Player Register</div>
      </div>
    </>
  );
}
