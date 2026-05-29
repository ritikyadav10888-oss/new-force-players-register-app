'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from './home.module.css';

// ─── Icons (inline SVGs for zero dependency) ────────────────────────────────
const ArrowRight = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7"/>
  </svg>
);
const ChevronRight = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18l6-6-6-6"/>
  </svg>
);
const Settings = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
  </svg>
);
const MenuIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
);
const CloseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const GlobeMini = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

export default function Home() {
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, regs: 0, volume: 0, players: 0 });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const fetchTournamentsAndStats = async () => {
      try {
        const [tournamentsRes, statsRes] = await Promise.all([
          fetch('/api/tournaments'),
          fetch('/api/public/stats'),
        ]);

        const tournamentsData = await tournamentsRes.json();
        const statsData = await statsRes.json();

        if (!tournamentsRes.ok) throw new Error(tournamentsData.error || 'Failed to load tournaments');

        const mappedTournaments = (tournamentsData || []).map((t: any) => ({
          id: t.id,
          slug: t.slug,
          name: t.name,
          type: t.type,
          venue: t.venue,
          fee: Number(t.fee) || 0,
          maxPlayers: t.max_players,
          theme: t.theme,
          description: t.description,
          rules: t.rules,
          terms: t.terms,
          organizerName: t.organizer_name,
          organizerPhone: t.organizer_phone,
          registrationDeadline: t.registration_deadline,
          status: t.status,
          customFields: t.custom_fields,
          formConfig: t.form_config,
          teamCount: 0,
        }));

        setTournaments(mappedTournaments);

        if (statsRes.ok) {
          setStats({
            total: statsData.total ?? mappedTournaments.length,
            regs: statsData.regs ?? 0,
            volume: statsData.volume ?? 0,
            players: statsData.players ?? 0,
          });
        }
      } catch (err: any) {
        console.error('Error fetching home page data:', err.message);
      }
    };

    fetchTournamentsAndStats();
  }, []);

  return (
    <>
      {/* Ambient background glows */}
      <div className={styles.ambientGlowWrapper} aria-hidden="true">
        <div className={styles.glowBallLeft} />
        <div className={styles.glowBallRight} />
        <div className={styles.glowBallBottom} />
      </div>

      <div className={styles.pageWrapper}>

        {/* ── STICKY NAVBAR ── */}
        <nav className={styles.navBar}>
          <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div className={styles.logoArea}>
              <div className={styles.logoIcon}>F</div>
              <span className={styles.logoText}>Force Sports Player Register</span>
            </div>
            <div className={styles.navLinks}>
              <a href="#how-it-works" className={styles.navLink}>How it works</a>
              <a href="#tournaments" className={styles.navLink}>Tournaments</a>
              <Link href="/contact" className={styles.navLink}>Contact</Link>
              <Link
                href="/admin"
                className={styles.ctaSecondary}
                style={{ padding: '0.45rem 1rem', fontSize: '0.875rem', borderRadius: '0.5rem' }}
              >
                <Settings /> Admin
              </Link>
            </div>
            <button className={styles.mobileMenuBtn} onClick={() => setIsMobileMenuOpen(true)}>
              <MenuIcon />
            </button>
          </div>
        </nav>

        {/* ── MOBILE MENU OVERLAY ── */}
        <div className={`${styles.mobileMenuOverlay} ${isMobileMenuOpen ? styles.mobileMenuOpen : ''}`}>
          <div className={styles.mobileMenuHeader}>
            <div className={styles.logoArea}>
              <div className={styles.logoIcon}>F</div>
              <span className={styles.logoText}>Force Sports Player Register</span>
            </div>
            <button className={styles.mobileMenuCloseBtn} onClick={() => setIsMobileMenuOpen(false)}>
              <CloseIcon />
            </button>
          </div>
          <div className={styles.mobileMenuLinks}>
            <a href="#how-it-works" className={styles.mobileMenuLink} onClick={() => setIsMobileMenuOpen(false)}>How it works</a>
            <a href="#tournaments" className={styles.mobileMenuLink} onClick={() => setIsMobileMenuOpen(false)}>Tournaments</a>
            <Link href="/contact" className={styles.mobileMenuLink} onClick={() => setIsMobileMenuOpen(false)}>Contact Us</Link>
            <Link href="/admin" className={styles.mobileMenuLink} onClick={() => setIsMobileMenuOpen(false)} style={{ color: '#818cf8', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Settings /> Admin Panel
            </Link>
          </div>
        </div>

        <div className="container">

          {/* ── HERO ── */}
          <section className={styles.heroSection}>
            <div className={styles.heroBadge}>
              🏆&nbsp; India&apos;s Smartest Tournament Registration Platform
            </div>
            <h1 className={styles.mainTitle}>
              Register. Play.&nbsp;
              <span className={styles.titleAccent}>Win Together.</span>
            </h1>
            <p className={styles.subtitle}>
              End-to-end tournament management — from customizable player forms and
              Razorpay payments to real-time roster dashboards and one-click CSV exports.
            </p>
            <div className={styles.ctaGroup}>
              <a href="#tournaments" className={styles.ctaPrimary}>
                Browse Open Tournaments <ArrowRight />
              </a>
              <Link href="/contact" className={styles.ctaSecondary}>
                Contact Us
              </Link>
            </div>
          </section>

          {/* ── STATS STRIP ── */}
          {stats.total > 0 && (
            <div className={styles.statsStrip} style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <div className={styles.statItem}>
                <div className={styles.statNum}>{stats.total}</div>
                <div className={styles.statLabel}>Open public tournaments</div>
              </div>
              <div className={styles.statItem}>
                <div className={styles.statNum}>{stats.regs}</div>
                <div className={styles.statLabel}>Teams Registered</div>
              </div>
              <div className={styles.statItem}>
                <div className={styles.statNum}>{stats.players}</div>
                <div className={styles.statLabel}>Players Enrolled</div>
              </div>
            </div>
          )}

          {/* ── HOW IT WORKS ── */}
          <section id="how-it-works" className={styles.howSection}>
            <div className={styles.sectionTag}>Process</div>
            <h2 className={styles.sectionTitle}>How the Registration Works</h2>
            <p className={styles.sectionSub}>
              Three simple steps from tournament creation to a fully paid, verified roster
            </p>

            <div className={styles.stepsFlow}>
              {/* Step 1 */}
              <div
                className={styles.stepCard}
                style={{ ['--stepColor1' as any]: '#6366f1', ['--stepColor2' as any]: '#818cf8' }}
              >
                <div
                  className={styles.stepNumber}
                  style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.25)' }}
                >
                  01
                </div>
                <div className={styles.stepTitle}>Organiser Creates Tournament</div>
                <p className={styles.stepDesc}>
                  Admin sets tournament name, venue, deadline, and entry fee. Choose <strong style={{ color: '#a5b4fc' }}>public</strong> to list it on the homepage, or <strong style={{ color: '#a5b4fc' }}>private</strong> for invite-only links. Then pick which
                  player fields to show — Name, Email, Phone, DOB, Jersey, Position and more.
                  Any extra custom fields can be added dynamically.
                </p>
                <div style={{ marginTop: '1.5rem' }}>
                  <Link
                    href="/admin/tournaments/create"
                    style={{ fontSize: '0.82rem', color: '#818cf8', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600 }}
                  >
                    Open Admin Panel <ChevronRight />
                  </Link>
                </div>
              </div>

              {/* Arrow */}
              <div className={styles.flowArrow}>
                <ChevronRight />
              </div>

              {/* Step 2 */}
              <div
                className={styles.stepCard}
                style={{ ['--stepColor1' as any]: '#c084fc', ['--stepColor2' as any]: '#f472b6' }}
              >
                <div
                  className={styles.stepNumber}
                  style={{ background: 'rgba(192,132,252,0.12)', color: '#c084fc', border: '1px solid rgba(192,132,252,0.25)' }}
                >
                  02
                </div>
                <div className={styles.stepTitle}>Players Fill & Pay</div>
                <p className={styles.stepDesc}>
                  Each team captain visits the unique registration link. Players fill a multi-step
                  form — team details, roster info (age auto-calculated from DOB), jersey sizes —
                  then complete secure Razorpay payment to lock their spot.
                </p>
                <div style={{ marginTop: '1.5rem' }}>
                  {tournaments.length > 0 ? (
                    <Link
                      href={`/register/${tournaments[0].slug}`}
                      style={{ fontSize: '0.82rem', color: '#c084fc', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600 }}
                    >
                      Try Sample Registration <ChevronRight />
                    </Link>
                  ) : (
                    <span style={{ fontSize: '0.82rem', color: '#475569' }}>Awaiting tournaments…</span>
                  )}
                </div>
              </div>

              {/* Arrow */}
              <div className={styles.flowArrow}>
                <ChevronRight />
              </div>

              {/* Step 3 */}
              <div
                className={styles.stepCard}
                style={{ ['--stepColor1' as any]: '#10b981', ['--stepColor2' as any]: '#34d399' }}
              >
                <div
                  className={styles.stepNumber}
                  style={{ background: 'rgba(16,185,129,0.1)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)' }}
                >
                  03
                </div>
                <div className={styles.stepTitle}>Admin Reviews & Exports</div>
                <p className={styles.stepDesc}>
                  The dashboard shows every registered team, their full roster, and live payment
                  status. One click downloads a clean Excel-ready CSV with all enabled fields
                  as dynamic column headers.
                </p>
                <div style={{ marginTop: '1.5rem' }}>
                  <Link
                    href="/admin"
                    style={{ fontSize: '0.82rem', color: '#34d399', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600 }}
                  >
                    View Dashboard <ChevronRight />
                  </Link>
                </div>
              </div>
            </div>
          </section>

          {/* ── OPEN TOURNAMENTS ── */}
          <section id="tournaments" className={styles.tournamentsSection}>
            <div className={styles.sectionTag}>Live Now</div>
            <h2 className={styles.sectionTitle}>Open Registrations</h2>
            <p className={styles.sectionSub}>
              Tournaments listed here are visible to everyone. Invite-only events stay off this page but still work via their direct link.
            </p>

            <div className={styles.listingNote} role="note">
              <span aria-hidden style={{ fontSize: '1.1rem', lineHeight: 1 }}>🌐</span>
              <span>
                <strong>Public listings only.</strong> Organisers can mark a tournament private in admin — it will not appear below, and players register using the shared URL only.
              </span>
            </div>

            <div className={styles.tournamentGrid}>
              {tournaments.length === 0 ? (
                <div className={styles.emptyState}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🏟️</div>
                  <div className={styles.emptyStateLead}>No public tournaments open right now</div>
                  <p className={styles.emptyStateHint}>
                    Private invite-only events are hidden from this page. If you have a registration link from your organiser, open it directly to sign up.
                  </p>
                </div>
              ) : (
                tournaments.map((t: any) => {
                  const teamCount = t.teamCount || 0;

                  return (
                    <div key={t.id} className={styles.tournamentCard}>
                      <div>
                        <div className={styles.tCardBadges}>
                          <span className={styles.tTypeBadge}>{t.type || 'Team'} Tournament</span>
                          <span className={styles.tListingBadge}>
                            <GlobeMini /> Public listing
                          </span>
                        </div>
                        <h3 className={styles.tName}>{t.name}</h3>
                        <div className={styles.tMeta}>
                          {t.venue && (
                            <div className={styles.tMetaRow}>
                              <span className={styles.tMetaIcon}>📍</span>
                              <span>{t.venue}</span>
                            </div>
                          )}
                          {t.registrationDeadline && (
                            <div className={styles.tMetaRow}>
                              <span className={styles.tMetaIcon}>📅</span>
                              <span>
                                Deadline:{' '}
                                {new Date(t.registrationDeadline).toLocaleDateString('en-IN', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </span>
                            </div>
                          )}
                          <div className={styles.tMetaRow}>
                            <span className={styles.tMetaIcon}>👥</span>
                            <span>{teamCount} team{teamCount !== 1 ? 's' : ''} registered</span>
                          </div>
                        </div>
                      </div>
                      <div className={styles.tFooter}>
                        <div className={styles.tFee}>₹{(t.fee || 0).toLocaleString('en-IN')}</div>
                        <Link href={`/register/${t.slug}`} className={styles.tRegBtn}>
                          Register Now <ArrowRight />
                        </Link>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* ── FEATURES ── */}
          <section className={styles.featuresSection}>
            <div className={styles.sectionTag}>Capabilities</div>
            <h2 className={styles.sectionTitle}>Everything You Need</h2>
            <p className={styles.sectionSub}>Built specifically for Indian sports tournament organisers</p>

            <div className={styles.featuresGrid}>
              {[
                {
                  icon: '⚙️', bg: 'rgba(99,102,241,0.1)',
                  title: 'Fully Custom Forms',
                  desc: 'Enable or disable each standard field per tournament. Toggle DOB, Emergency Contact, Jersey details, Gender — or add your own custom questions.'
                },
                {
                  icon: '💳', bg: 'rgba(16,185,129,0.08)',
                  title: 'Razorpay Integration',
                  desc: 'Secure UPI, card, and net banking payments. Track paid vs pending registrations. Every transaction ID is logged automatically.'
                },
                {
                  icon: '🧮', bg: 'rgba(192,132,252,0.1)',
                  title: 'Auto Age Calculator',
                  desc: 'Players enter their Date of Birth; the age field fills itself instantly. No manual data entry errors. Works for under-16, under-19, and open categories.'
                },
                {
                  icon: '📊', bg: 'rgba(245,158,11,0.08)',
                  title: 'Smart CSV Export',
                  desc: 'Download a perfectly structured spreadsheet with only the fields you enabled. Ready for Excel, Google Sheets, or printing.'
                },
                {
                  icon: '🏅', bg: 'rgba(239,68,68,0.08)',
                  title: 'Team & Solo Modes',
                  desc: 'Create team tournaments with multi-player rosters or solo individual entries. Flexible min/max player counts per team.'
                },
                {
                  icon: '🔗', bg: 'rgba(59,130,246,0.08)',
                  title: 'Shareable Links',
                  desc: 'Each tournament gets a unique public URL. Share it on WhatsApp, Instagram or your website — players register in minutes.'
                },
              ].map((f) => (
                <div key={f.title} className={styles.featureCard}>
                  <div className={styles.featureIconWrap} style={{ background: f.bg }}>
                    {f.icon}
                  </div>
                  <div className={styles.featureTitle}>{f.title}</div>
                  <p className={styles.featureDesc}>{f.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── FINAL CTA BANNER ── */}
          <section className={styles.ctaBanner}>
            <h2 className={styles.ctaBannerTitle}>
              Ready to Run Your Next Tournament?
            </h2>
            <p className={styles.ctaBannerSub}>
              Set up in under 5 minutes. No technical skills needed.
            </p>
            <div className={styles.ctaGroup}>
              <Link href="/contact" className={styles.ctaPrimary}>
                Contact Us <ArrowRight />
              </Link>
            </div>
          </section>

          {/* ── FOOTER ── */}
          <footer className={styles.footer}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '2rem', width: '100%', marginBottom: '2rem', textAlign: 'left' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <div style={{ width: '1.6rem', height: '1.6rem', background: 'linear-gradient(135deg,#6366f1,#c084fc)', borderRadius: '0.35rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.75rem', color: 'white' }}>F</div>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#94a3b8' }}>Force Sports Player Register</span>
                </div>
                <p style={{ fontSize: '0.78rem', color: '#334155', lineHeight: 1.6 }}>India&apos;s smartest tournament registration platform.</p>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#334155', marginBottom: '0.75rem' }}>Platform</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <a href="#tournaments" className={styles.footerLink}>Open Tournaments</a>
                  <a href="#how-it-works" className={styles.footerLink}>How It Works</a>
                  <Link href="/admin/tournaments/create" className={styles.footerLink}>Create Tournament</Link>
                  <Link href="/admin" className={styles.footerLink}>Admin Panel</Link>
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#334155', marginBottom: '0.75rem' }}>Support</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <Link href="/contact" className={styles.footerLink}>Contact Us</Link>
                  <Link href="/contact" className={styles.footerLink}>info@forcesports.in</Link>
                  <Link href="/contact" className={styles.footerLink}>WhatsApp Support</Link>
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#334155', marginBottom: '0.75rem' }}>Legal</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <Link href="/terms" className={styles.footerLink}>Terms &amp; Conditions</Link>
                  <Link href="/privacy" className={styles.footerLink}>Privacy Policy</Link>
                </div>
              </div>
            </div>
            <div style={{ width: '100%', height: '1px', background: 'rgba(255,255,255,0.04)', marginBottom: '1.5rem' }} />
            <div>© 2026 Force Playing Field India Pvt. Ltd. · Tournament Registration Platform</div>
          </footer>

        </div>
      </div>
    </>
  );
}
