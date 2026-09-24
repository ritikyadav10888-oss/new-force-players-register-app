'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from './home.module.css';
import { isTeamLikeTournamentType } from '@/lib/multi-sport';

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
  const [stats, setStats] = useState({ total: 0, regs: 0, individualRegs: 0, volume: 0, players: 0 });
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
            individualRegs: statsData.individualRegs ?? 0,
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
              <img src="/logo.png" alt="Force Pulse" className={styles.logoIcon} />
              <span className={styles.logoText}>Force Pulse</span>
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
              <img src="/logo.png" alt="Force Pulse" className={styles.logoIcon} />
              <span className={styles.logoText}>Force Pulse</span>
            </div>
            <button className={styles.mobileMenuCloseBtn} onClick={() => setIsMobileMenuOpen(false)}>
              <CloseIcon />
            </button>
          </div>
          <div className={styles.mobileMenuLinks}>
            <a href="#how-it-works" className={styles.mobileMenuLink} onClick={() => setIsMobileMenuOpen(false)}>How it works</a>
            <a href="#tournaments" className={styles.mobileMenuLink} onClick={() => setIsMobileMenuOpen(false)}>Tournaments</a>
            <Link href="/contact" className={styles.mobileMenuLink} onClick={() => setIsMobileMenuOpen(false)}>Contact Us</Link>
            <Link href="/admin" className={styles.mobileMenuLink} onClick={() => setIsMobileMenuOpen(false)} style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Settings /> Admin Panel
            </Link>
          </div>
        </div>

        <div className="container">

          {/* ── HERO ── */}
          <section className={styles.heroSection}>
            <div className={styles.heroBadge}>
              Sports registration
            </div>
            <h1 className={styles.mainTitle}>
              Register for the events&nbsp;
              <span className={styles.titleAccent}>you can play.</span>
            </h1>
            <p className={styles.subtitle}>
              Organisers set age groups, who can enter each sport, and the fee.
              Players add a date of birth and only see the events they are allowed to join.
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
            <div className={styles.statsStrip} style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <div className={styles.statItem}>
                <div className={styles.statNum}>{stats.total}</div>
                <div className={styles.statLabel}>Public tournaments</div>
              </div>
              <div className={styles.statItem}>
                <div className={styles.statNum}>{stats.regs}</div>
                <div className={styles.statLabel}>Team entries</div>
              </div>
              <div className={styles.statItem}>
                <div className={styles.statNum}>{stats.individualRegs}</div>
                <div className={styles.statLabel}>Individual entries</div>
              </div>
              <div className={styles.statItem}>
                <div className={styles.statNum}>{stats.players}</div>
                <div className={styles.statLabel}>Players</div>
              </div>
            </div>
          )}

          {/* ── HOW IT WORKS ── */}
          <section id="how-it-works" className={styles.howSection}>
            <div className={styles.sectionTag}>How it works</div>
            <h2 className={styles.sectionTitle}>From the form to a paid entry</h2>
            <p className={styles.sectionSub}>
              Set the rules once. Players only see the events that match their age and gender.
            </p>

            <div className={styles.stepsFlow}>
              {/* Step 1 */}
              <div className={styles.stepCard}>
                <div className={`${styles.stepNum} ${styles.stepNumIndigo}`}>01</div>
                <div className={styles.stepTitle}>Set the rules</div>
                <p className={styles.stepDesc}>
                  Name the event, venue, and deadline. Add age groups and mark which sports each
                  category and gender can enter. Charge one fee, a fee per event, or a first-event
                  fee plus a smaller fee for every extra event.
                </p>
                <Link href="/admin/tournaments/create" className={`${styles.stepLink} ${styles.stepLinkIndigo}`}>
                  Create a tournament <ChevronRight />
                </Link>
              </div>

              {/* Arrow */}
              <div className={styles.flowArrow}>
                <ChevronRight />
              </div>

              {/* Step 2 */}
              <div className={styles.stepCard}>
                <div className={`${styles.stepNum} ${styles.stepNumViolet}`}>02</div>
                <div className={styles.stepTitle}>Players register</div>
                <p className={styles.stepDesc}>
                  A date of birth sets the age group. The player chooses a gender and only sees
                  the events they can enter. Extra questions and photos can be collected before
                  they pay and confirm the spot.
                </p>
                {tournaments.length > 0 ? (
                  <Link
                    href={`/register/${tournaments[0].slug}`}
                    className={`${styles.stepLink} ${styles.stepLinkViolet}`}
                  >
                    Open a registration <ChevronRight />
                  </Link>
                ) : (
                  <span className={styles.stepLink} style={{ color: 'var(--muted)' }}>
                    No public tournament is open yet.
                  </span>
                )}
              </div>

              {/* Arrow */}
              <div className={styles.flowArrow}>
                <ChevronRight />
              </div>

              {/* Step 3 */}
              <div className={styles.stepCard}>
                <div className={`${styles.stepNum} ${styles.stepNumGreen}`}>03</div>
                <div className={styles.stepTitle}>Keep the roster</div>
                <p className={styles.stepDesc}>
                  The admin list shows each entry, the payment, and the player details you asked
                  for. Download a spreadsheet with those fields as the columns.
                </p>
                <Link href="/admin" className={`${styles.stepLink} ${styles.stepLinkGreen}`}>
                  Open the dashboard <ChevronRight />
                </Link>
              </div>
            </div>
          </section>

          {/* ── OPEN TOURNAMENTS ── */}
          <section id="tournaments" className={styles.tournamentsSection}>
            <div className={styles.sectionTag}>Open now</div>
            <h2 className={styles.sectionTitle}>Public tournaments</h2>
            <p className={styles.sectionSub}>
              These events are open to anyone with this page. Private events stay off the list and open only from the link you share.
            </p>

            <div className={styles.listingNote} role="note">
              <span aria-hidden style={{ fontSize: '1.1rem', lineHeight: 1 }}>🌐</span>
              <span>
                <strong>Public events only.</strong> A private tournament does not appear here. Players use the link the organiser sends.
              </span>
            </div>

            <div className={styles.tournamentGrid}>
              {tournaments.length === 0 ? (
                <div className={styles.emptyState}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🏟️</div>
                  <div className={styles.emptyStateLead}>No public tournaments are open</div>
                  <p className={styles.emptyStateHint}>
                    If an organiser sent you a registration link, open that link to sign up. Private events are not listed here.
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
                            <span>
                              {teamCount}{' '}
                              {isTeamLikeTournamentType(t.type)
                                ? `team${teamCount !== 1 ? 's' : ''} registered`
                                : `entr${teamCount !== 1 ? 'ies' : 'y'} registered`}
                            </span>
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
            <div className={styles.sectionTag}>What you can set</div>
            <h2 className={styles.sectionTitle}>The form follows the tournament</h2>
            <p className={styles.sectionSub}>Each event can use its own age groups, events, fees, and questions.</p>

            <div className={styles.featuresGrid}>
              {[
                {
                  icon: '🎂', bg: 'rgba(99,102,241,0.1)',
                  title: 'Age from date of birth',
                  desc: 'The age group is worked out from the date of birth. Change the date and the category changes with it.'
                },
                {
                  icon: '🎯', bg: 'rgba(16,185,129,0.08)',
                  title: 'Events by category and gender',
                  desc: 'You choose which sports each age group and gender can enter. Players never see an event they cannot join.'
                },
                {
                  icon: '💳', bg: 'rgba(192,132,252,0.1)',
                  title: 'Fees you control',
                  desc: 'One fee for the entry, a fee on each event, or the first event at one price and every extra event at another.'
                },
                {
                  icon: '📷', bg: 'rgba(245,158,11,0.08)',
                  title: 'Your own questions',
                  desc: 'Turn standard fields on or off. Add text, numbers, dropdowns, and a photo when you need one.'
                },
                {
                  icon: '👥', bg: 'rgba(239,68,68,0.08)',
                  title: 'Team or individual',
                  desc: 'Register one player, a pair, or a squad with a team name. Set how many players a team needs.'
                },
                {
                  icon: '🔗', bg: 'rgba(59,130,246,0.08)',
                  title: 'A link to share',
                  desc: 'Public tournaments appear on this page. Private ones open only from the link you send on WhatsApp or anywhere else.'
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
              Open registrations for the next event
            </h2>
            <p className={styles.ctaBannerSub}>
              Set the age groups and fees, share the link, and collect entries online.
            </p>
            <div className={styles.ctaGroup}>
              <Link href="/contact" className={styles.ctaPrimary}>
                Contact Us <ArrowRight />
              </Link>
            </div>
          </section>

          {/* ── FOOTER ── */}
          <footer className={styles.footer}>
            <div className={styles.footerGrid}>
              <div>
                <div className={styles.footerBrand}>
                  <img src="/logo.png" alt="" style={{ width: '1.75rem', height: '1.75rem', objectFit: 'contain', borderRadius: '0.3rem' }} />
                  Force Pulse
                </div>
                <p className={styles.footerBlurb}>Registration for sports events, with age groups, eligible events, and online payment.</p>
              </div>
              <div>
                <div className={styles.footerHeading}>Platform</div>
                <div className={styles.footerCol}>
                  <a href="#tournaments" className={styles.footerLink}>Public tournaments</a>
                  <a href="#how-it-works" className={styles.footerLink}>How it works</a>
                  <Link href="/admin/tournaments/create" className={styles.footerLink}>Create a tournament</Link>
                  <Link href="/admin" className={styles.footerLink}>Admin</Link>
                </div>
              </div>
              <div>
                <div className={styles.footerHeading}>Support</div>
                <div className={styles.footerCol}>
                  <Link href="/contact" className={styles.footerLink}>Contact</Link>
                  <Link href="/contact" className={styles.footerLink}>info@forcesports.in</Link>
                  <Link href="/contact" className={styles.footerLink}>WhatsApp</Link>
                </div>
              </div>
              <div>
                <div className={styles.footerHeading}>Legal</div>
                <div className={styles.footerCol}>
                  <Link href="/terms" className={styles.footerLink}>Terms</Link>
                  <Link href="/privacy" className={styles.footerLink}>Privacy</Link>
                </div>
              </div>
            </div>
            <div className={styles.footerRule} />
            <div>© 2026 Force Playing Field India Pvt. Ltd.</div>
          </footer>

        </div>
      </div>
    </>
  );
}
