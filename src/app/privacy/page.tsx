'use client';
import Link from 'next/link';

const sections = [
  {
    title: '1. Information We Collect',
    items: [
      'Personal identification: Full name, date of birth, age, gender',
      'Contact details: Email address, phone number, emergency contact',
      'Sports details: Jersey name, jersey number, jersey size, cricket specialty/role',
      'Payment information: Processed entirely by Razorpay — we do not store card or bank details',
      'Custom fields: Any additional information requested by the tournament organiser',
    ],
  },
  {
    title: '2. How We Use Your Information',
    body: `Your information is used exclusively for the following purposes:\n• Registering you or your team for the selected tournament\n• Communicating important event updates and logistics\n• Verifying payment status via Razorpay transaction IDs\n• Enabling tournament organisers to manage rosters and export participant data\n• Improving the Platform experience and functionality`,
  },
  {
    title: '3. Data Storage',
    body: `All registration data is stored locally in your browser's localStorage during the session. Tournament organisers with admin access can view and export this data in CSV format. We do not operate a centralised cloud database for player data in the current version of this Platform. Data persists only within the browser it was submitted from.`,
  },
  {
    title: '4. Data Sharing',
    body: `We do not sell, trade, or rent your personal information to third parties. Your data may be shared with:\n• The tournament organiser who created the event you registered for\n• Razorpay (payment processing only) — governed by Razorpay's own Privacy Policy\n• Government or legal authorities only if required by law`,
  },
  {
    title: '5. Payment Security',
    body: `All payments are processed through Razorpay, a PCI-DSS compliant payment gateway. Force Playing Field India Pvt. Ltd. does not access, store, or process your card number, UPI ID, or net banking credentials. Razorpay's security infrastructure ensures end-to-end encryption of all financial transactions.`,
  },
  {
    title: '6. Cookies',
    body: `This Platform uses minimal browser storage (localStorage) to maintain your session and store tournament data. We do not use tracking cookies or third-party analytics cookies. No personal data is transmitted to advertising networks.`,
  },
  {
    title: '7. Your Rights',
    body: `You have the right to:\n• Request a copy of the data we hold about you\n• Request correction of inaccurate data\n• Request deletion of your data by contacting the tournament organiser or our team\n• Withdraw consent for data processing (note: this may affect your registration status)`,
  },
  {
    title: '8. Data Retention',
    body: `Registration data is retained for the duration of the tournament season and up to 12 months thereafter for record-keeping and dispute resolution purposes. After this period, data may be anonymised or deleted.`,
  },
  {
    title: '9. Children\'s Privacy',
    body: `Tournaments may include under-18 categories. Where participants are minors, registration must be completed by a parent or guardian who provides consent on their behalf. We take special care with the personal data of minors and do not use it for any purpose beyond event management.`,
  },
  {
    title: '10. Changes to This Policy',
    body: `We may update this Privacy Policy periodically. Material changes will be highlighted on the Platform. Continued use of the Platform after changes are posted constitutes your acceptance of the revised Policy.`,
  },
  {
    title: '11. Contact Us',
    body: `For any privacy-related queries, requests, or complaints please contact: privacy@forcesports.in or visit our Contact page. We aim to respond within 48 hours.`,
  },
];

export default function PrivacyPage() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .legal-root { min-height:100vh; background:#09090d; font-family:'Inter',sans-serif; color:#f8fafc; position:relative; overflow-x:hidden; }
        .legal-orb1 { position:fixed; pointer-events:none; border-radius:50%; z-index:0; width:500px; height:500px; filter:blur(80px); background:radial-gradient(circle,rgba(16,185,129,0.1),transparent 65%); top:-100px; left:-100px; }
        .legal-orb2 { position:fixed; pointer-events:none; border-radius:50%; z-index:0; width:400px; height:400px; filter:blur(80px); background:radial-gradient(circle,rgba(99,102,241,0.1),transparent 65%); bottom:0; right:-80px; }
        .legal-nav { position:sticky; top:0; z-index:100; background:rgba(9,9,13,0.85); backdrop-filter:blur(16px); border-bottom:1px solid rgba(255,255,255,0.05); padding:1rem 0; }
        .legal-nav-inner { max-width:900px; margin:0 auto; padding:0 1.5rem; display:flex; justify-content:space-between; align-items:center; }
        .legal-logo { display:flex; align-items:center; gap:0.65rem; text-decoration:none; }
        .legal-logo-icon { width:2rem; height:2rem; background:linear-gradient(135deg,#6366f1,#c084fc); border-radius:0.4rem; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:0.9rem; color:white; }
        .legal-logo-text { font-size:1rem; font-weight:800; background:linear-gradient(135deg,#818cf8,#c084fc); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
        .legal-back { display:inline-flex; align-items:center; gap:0.35rem; font-size:0.82rem; color:#64748b; text-decoration:none; font-weight:500; transition:color 0.2s; }
        .legal-back:hover { color:#94a3b8; }
        .legal-body { position:relative; z-index:1; max-width:760px; margin:0 auto; padding:4rem 1.5rem 6rem; }
        .legal-tag { display:inline-block; font-size:0.72rem; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:#10b981; margin-bottom:1rem; }
        .legal-h1 { font-size:clamp(1.75rem,5vw,2.75rem); font-weight:900; letter-spacing:-0.03em; margin-bottom:0.75rem; color:#f1f5f9; }
        .legal-meta { font-size:0.82rem; color:#475569; margin-bottom:3rem; padding-bottom:2rem; border-bottom:1px solid rgba(255,255,255,0.05); }
        .legal-section { margin-bottom:2.5rem; }
        .legal-section-title { font-size:1.05rem; font-weight:700; color:#e2e8f0; margin-bottom:0.75rem; display:flex; align-items:center; gap:0.5rem; }
        .legal-section-title::before { content:''; width:3px; height:1.1em; background:linear-gradient(180deg,#10b981,#34d399); border-radius:9999px; flex-shrink:0; }
        .legal-section-body { font-size:0.925rem; color:#94a3b8; line-height:1.75; padding-left:1rem; white-space:pre-line; }
        .legal-list { list-style:none; padding-left:1rem; display:flex; flex-direction:column; gap:0.5rem; }
        .legal-list li { font-size:0.925rem; color:#94a3b8; line-height:1.6; display:flex; gap:0.5rem; }
        .legal-list li::before { content:'•'; color:#10b981; flex-shrink:0; }
        .legal-footer { max-width:760px; margin:0 auto; padding:2rem 1.5rem; border-top:1px solid rgba(255,255,255,0.04); display:flex; flex-wrap:wrap; gap:1rem; justify-content:space-between; align-items:center; position:relative; z-index:1; }
        .legal-footer-text { font-size:0.8rem; color:#334155; }
        .legal-footer-links { display:flex; gap:1.5rem; flex-wrap:wrap; }
        .legal-footer-link { font-size:0.8rem; color:#475569; text-decoration:none; transition:color 0.2s; }
        .legal-footer-link:hover { color:#818cf8; }
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
          <div className="legal-tag">🔒 Privacy</div>
          <h1 className="legal-h1">Privacy Policy</h1>
          <p className="legal-meta">Last updated: May 2026 · We respect your privacy and are committed to protecting your personal data</p>

          {sections.map(s => (
            <div key={s.title} className="legal-section">
              <div className="legal-section-title">{s.title}</div>
              {s.items ? (
                <ul className="legal-list">
                  {s.items.map(i => <li key={i}>{i}</li>)}
                </ul>
              ) : (
                <p className="legal-section-body">{s.body}</p>
              )}
            </div>
          ))}
        </div>

        <footer className="legal-footer">
          <span className="legal-footer-text">© 2026 Force Playing Field India Pvt. Ltd.</span>
          <div className="legal-footer-links">
            <Link href="/terms" className="legal-footer-link">Terms &amp; Conditions</Link>
            <Link href="/contact" className="legal-footer-link">Contact Us</Link>
            <Link href="/" className="legal-footer-link">Home</Link>
          </div>
        </footer>
      </div>
    </>
  );
}
