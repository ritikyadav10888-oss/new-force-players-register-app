'use client';
import Link from 'next/link';

const sections = [
  {
    title: '1. Acceptance of Terms',
    body: `By accessing or using the Force Playing Field India Pvt. Ltd. tournament registration platform ("Platform"), you agree to be bound by these Terms and Conditions. If you do not agree to all terms, please do not use this Platform. These terms apply to all users including team captains, individual players, tournament organisers, and administrators.`,
  },
  {
    title: '2. Platform Scope — Registration Only',
    body: `Force Playing Field India Pvt. Ltd. is a player registration platform only. Our sole role is to provide a smooth, secure, and reliable online registration experience for sports tournaments. We do not organise, manage, supervise, or control any tournament, match, or sporting event listed on this Platform.\n\nAll matters relating to tournament scheduling, match rules, venue arrangements, referees, results, disputes, or any other aspect of the event's conduct are the exclusive responsibility of the respective tournament organiser. For any such queries, concerns, or complaints, please contact the organiser directly using the contact details provided on the tournament page.`,
  },
  {
    title: '3. Tournament Registration',
    body: `Registration for any tournament is subject to availability and the specific rules set by the event organiser. By completing registration you confirm that all information provided — including player names, age, jersey details, emergency contacts, and other required fields — is accurate and truthful. Providing false information may result in disqualification without refund.`,
  },
  {
    title: '4. Entry Fees & Payments',
    body: `All entry fees are processed securely through Razorpay. Payments are non-refundable once a registration is confirmed, unless the tournament is cancelled by the organiser. In the event of cancellation, refunds will be processed within 7–10 business days to the original payment method. A payment gateway fee of 2.36% applies to all transactions.\n\nForce Playing Field India Pvt. Ltd. is not responsible for any refund decisions made by the tournament organiser. All refund disputes must be raised directly with the organiser.`,
  },
  {
    title: '5. Roster & Player Information',
    body: `Team captains are responsible for the accuracy of their roster submissions. All players listed must be aware that their information is being submitted for tournament registration. Player data collected (name, DOB, phone, jersey details, etc.) is used solely for the purpose of event management and will not be shared with third parties without consent.`,
  },
  {
    title: '6. Code of Conduct',
    body: `All participants are expected to behave in a sporting and respectful manner. Any form of harassment, abuse, or unsporting behaviour towards other players, officials, or staff may result in immediate disqualification and a ban from future events. Force Playing Field India Pvt. Ltd. reserves the right to remove any participant who violates this code without issuing a refund.`,
  },
  {
    title: '7. Liability Disclaimer',
    body: `Force Playing Field India Pvt. Ltd. is not responsible or liable — directly or indirectly — for:\n\n• The conduct, organisation, safety, or outcome of any tournament or match.\n• Any injury, loss, damage, or dispute arising during or in connection with a sporting event.\n• The actions, decisions, or omissions of any tournament organiser, team captain, official, or participant.\n• Cancellation, postponement, or modification of any event by the organiser.\n\nParticipants take part entirely at their own risk. It is the responsibility of each participant to maintain appropriate health and fitness levels and to follow all safety guidelines provided by the event organiser. By registering, you acknowledge that Force Playing Field India Pvt. Ltd.'s liability is strictly limited to the registration process itself.`,
  },
  {
    title: '8. Organiser Responsibility',
    body: `Tournament organisers who use this Platform to collect registrations are solely responsible for:\n\n• Conducting the event in a safe, fair, and lawful manner.\n• Communicating event details, schedule, and rules to registered players.\n• Handling disputes, results, and on-ground management.\n• Complying with all applicable local laws and sports regulations.\n\nForce Playing Field India Pvt. Ltd. acts only as a technical facilitator for the registration process and does not endorse or guarantee the quality or conduct of any listed event.`,
  },
  {
    title: '9. Intellectual Property',
    body: `All content on this Platform including logos, tournament names, design, and software is the property of Force Playing Field India Pvt. Ltd.. You may not reproduce, distribute, or use any content without prior written permission.`,
  },
  {
    title: '10. Changes to Terms',
    body: `Force Playing Field India Pvt. Ltd. reserves the right to update these Terms at any time. Continued use of the Platform after changes are posted constitutes acceptance of the new Terms. We encourage users to review this page periodically.`,
  },
  {
    title: '11. Governing Law',
    body: `These Terms are governed by the laws of India. Any disputes arising under these Terms shall be subject to the exclusive jurisdiction of courts in Mumbai, Maharashtra.`,
  },
  {
    title: '12. Contact',
    body: `For queries about your registration or the Platform, please visit our Contact page.\n\nFor queries about a specific tournament — including rules, schedules, venues, or results — please contact the tournament organiser directly using the details provided on the tournament registration page.`,
  },
];

export default function TermsPage() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .legal-root {
          min-height: 100vh;
          background: #09090d;
          font-family: 'Inter', sans-serif;
          color: #f8fafc;
          position: relative;
          overflow-x: hidden;
        }
        .legal-orb1 {
          position: fixed; pointer-events: none; border-radius: 50%; z-index: 0;
          width: 500px; height: 500px; filter: blur(80px);
          background: radial-gradient(circle, rgba(99,102,241,0.14), transparent 65%);
          top: -100px; left: -100px;
        }
        .legal-orb2 {
          position: fixed; pointer-events: none; border-radius: 50%; z-index: 0;
          width: 400px; height: 400px; filter: blur(80px);
          background: radial-gradient(circle, rgba(192,132,252,0.1), transparent 65%);
          bottom: 0; right: -80px;
        }

        .legal-nav {
          position: sticky; top: 0; z-index: 100;
          background: rgba(9,9,13,0.85);
          backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(255,255,255,0.05);
          padding: 1rem 0;
        }
        .legal-nav-inner {
          max-width: 900px; margin: 0 auto; padding: 0 1.5rem;
          display: flex; justify-content: space-between; align-items: center;
        }
        .legal-logo {
          display: flex; align-items: center; gap: 0.65rem; text-decoration: none;
        }
        .legal-logo-icon {
          width: 2rem; height: 2rem;
          background: linear-gradient(135deg, #6366f1, #c084fc);
          border-radius: 0.4rem;
          display: flex; align-items: center; justify-content: center;
          font-weight: 900; font-size: 0.9rem; color: white;
        }
        .legal-logo-text {
          font-size: 1rem; font-weight: 800;
          background: linear-gradient(135deg, #818cf8, #c084fc);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }
        .legal-back {
          display: inline-flex; align-items: center; gap: 0.35rem;
          font-size: 0.82rem; color: #64748b; text-decoration: none; font-weight: 500;
          transition: color 0.2s;
        }
        .legal-back:hover { color: #94a3b8; }

        .legal-body {
          position: relative; z-index: 1;
          max-width: 760px; margin: 0 auto;
          padding: 4rem 1.5rem 6rem;
        }

        .legal-tag {
          display: inline-block; font-size: 0.72rem; font-weight: 700;
          letter-spacing: 0.1em; text-transform: uppercase;
          color: #6366f1; margin-bottom: 1rem;
        }
        .legal-h1 {
          font-size: clamp(1.75rem, 5vw, 2.75rem);
          font-weight: 900; letter-spacing: -0.03em;
          margin-bottom: 0.75rem; color: #f1f5f9;
        }
        .legal-meta {
          font-size: 0.82rem; color: #475569; margin-bottom: 3rem;
          padding-bottom: 2rem; border-bottom: 1px solid rgba(255,255,255,0.05);
        }

        .legal-section { margin-bottom: 2.5rem; }
        .legal-section-title {
          font-size: 1.05rem; font-weight: 700; color: #e2e8f0;
          margin-bottom: 0.75rem;
          display: flex; align-items: center; gap: 0.5rem;
        }
        .legal-section-title::before {
          content: ''; width: 3px; height: 1.1em;
          background: linear-gradient(180deg, #6366f1, #c084fc);
          border-radius: 9999px; flex-shrink: 0;
        }
        .legal-section-body {
          font-size: 0.925rem; color: #94a3b8;
          line-height: 1.75; padding-left: 1rem;
        }

        .legal-footer {
          max-width: 760px; margin: 0 auto;
          padding: 2rem 1.5rem;
          border-top: 1px solid rgba(255,255,255,0.04);
          display: flex; flex-wrap: wrap; gap: 1rem;
          justify-content: space-between; align-items: center;
          position: relative; z-index: 1;
        }
        .legal-footer-text { font-size: 0.8rem; color: #334155; }
        .legal-footer-links { display: flex; gap: 1.5rem; flex-wrap: wrap; }
        .legal-footer-link { font-size: 0.8rem; color: #475569; text-decoration: none; transition: color 0.2s; }
        .legal-footer-link:hover { color: #818cf8; }
      `}</style>

      <div className="legal-root">
        <div className="legal-orb1" /><div className="legal-orb2" />

        <nav className="legal-nav">
          <div className="legal-nav-inner">
            <Link href="/" className="legal-logo">
              <div className="legal-logo-icon">F</div>
              <span className="legal-logo-text">Force Sports Player Register</span>
            </Link>
            <Link href="/" className="legal-back">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
              Back to Home
            </Link>
          </div>
        </nav>

        <div className="legal-body">
          <div className="legal-tag">📄 Legal</div>
          <h1 className="legal-h1">Terms &amp; Conditions</h1>
          <p className="legal-meta">Last updated: 29 May 2026 · Effective immediately upon registration</p>

          {sections.map(s => (
            <div key={s.title} className="legal-section">
              <div className="legal-section-title">{s.title}</div>
              <p className="legal-section-body">{s.body}</p>
            </div>
          ))}
        </div>

        <footer className="legal-footer">
          <span className="legal-footer-text">© 2026 Force Playing Field India Pvt. Ltd.</span>
          <div className="legal-footer-links">
            <Link href="/privacy" className="legal-footer-link">Privacy Policy</Link>
            <Link href="/contact" className="legal-footer-link">Contact Us</Link>
            <Link href="/" className="legal-footer-link">Home</Link>
          </div>
        </footer>
      </div>
    </>
  );
}
