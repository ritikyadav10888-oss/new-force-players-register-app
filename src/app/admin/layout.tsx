'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import styles from './adminLayout.module.css';

// ── Sidebar icon components ──────────────────────────────────────────────────
const IconDashboard = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
  </svg>
);
const IconUsers = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);
const IconPlus = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
  </svg>
);
const IconSettings = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
  </svg>
);
const IconLogout = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);
const IconMenu = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
);
const IconClose = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const IconHome = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);
const IconInbox = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
  </svg>
);

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [session, setSession] = useState<any>(null);
  const pathname = usePathname();
  const router   = useRouter();

  useEffect(() => {
    const applySession = async (activeSession: any) => {
      if (activeSession) {
        // Customers must not access the superadmin panel
        const { data: adminRow } = await supabase
          .from('admin_users')
          .select('role')
          .eq('user_id', activeSession.user.id)
          .maybeSingle();
        if (adminRow?.role === 'customer' && pathname !== '/admin/login') {
          setIsAuthenticated(false);
          router.push('/customer');
          return;
        }
        setIsAuthenticated(true);
        setSession({
          username: activeSession.user.email?.split('@')[0] || 'Admin',
          loginAt: activeSession.user.last_sign_in_at || new Date().toISOString(),
        });
      } else {
        setIsAuthenticated(false);
        if (pathname !== '/admin/login') router.push('/admin/login');
      }
    };

    const checkAuth = async () => {
      const { data: { session: activeSession } } = await supabase.auth.getSession();
      await applySession(activeSession);
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, activeSession) => {
      applySession(activeSession);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [pathname, router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/admin/login');
  };

  // Login page — no sidebar
  if (pathname === '/admin/login') return <main>{children}</main>;

  // Guard
  if (isAuthenticated === null || isAuthenticated === false) return null;

  const navItems = [
    { href: '/admin',                    label: 'Dashboard',         icon: <IconDashboard /> },
    { href: '/admin/tournaments/create', label: 'Create Tournament', icon: <IconPlus /> },
    { href: '/admin/players',            label: 'All Players',       icon: <IconUsers /> },
    { href: '/admin/customers',          label: 'Customers',         icon: <IconUsers /> },
    { href: '/admin/inquiries',          label: 'Inquiries',         icon: <IconInbox /> },
    { href: '/',                         label: 'Public Home',       icon: <IconHome /> },
  ];

  const initials = (session?.username || 'A').slice(0, 2).toUpperCase();
  const loginTime = session?.loginAt ? new Date(session.loginAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className={styles.adminContainer}>

      {/* ── Mobile Header ── */}
      <header className={styles.mobileHeader}>
        <span style={{ background: 'linear-gradient(135deg,#818cf8,#c084fc)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text', fontSize: '1.2rem', fontWeight: 800 }}>
          ForceAdmin
        </span>
        <button className={styles.menuBtn} onClick={() => setIsSidebarOpen(true)} aria-label="Open menu">
          <IconMenu />
        </button>
      </header>

      {/* ── Mobile Overlay ── */}
      <div
        className={`${styles.overlay} ${isSidebarOpen ? styles.open : ''}`}
        onClick={() => setIsSidebarOpen(false)}
      />

      {/* ── Sidebar ── */}
      <aside className={`${styles.sidebar} ${isSidebarOpen ? styles.open : ''}`}>

        {/* Logo row */}
        <div className={styles.logoContainer} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ background:'linear-gradient(135deg,#818cf8,#c084fc)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text', fontSize:'1.3rem', fontWeight:800, letterSpacing:'-0.02em' }}>
            ForceAdmin
          </span>
          <button className={styles.closeMobileMenuBtn} onClick={() => setIsSidebarOpen(false)} aria-label="Close menu">
            <IconClose />
          </button>
        </div>

        {/* User profile card */}
        <div style={{
          margin: '1rem 0 1.25rem',
          padding: '0.9rem 1rem',
          background: 'rgba(99,102,241,0.06)',
          border: '1px solid rgba(99,102,241,0.12)',
          borderRadius: '0.75rem',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
            <div style={{
              width: '2.4rem', height: '2.4rem',
              background: 'linear-gradient(135deg, #6366f1, #c084fc)',
              borderRadius: '50%',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontWeight: 800, fontSize: '0.85rem', color: 'white',
              flexShrink: 0,
            }}>
              {initials}
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#f1f5f9' }}>
                {session?.username || 'Admin'}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#475569' }}>
                Signed in {loginTime}
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className={styles.nav} style={{ flex: 1 }}>
          <div style={{ fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#334155', padding: '0 0.5rem', marginBottom: '0.5rem' }}>
            Navigation
          </div>
          {navItems.map(item => {
            const isActive = item.href === '/admin'
              ? pathname === '/admin'
              : pathname.startsWith(item.href) && item.href !== '/';
            return (
              <Link
                key={item.href}
                href={item.href}
                className={styles.navLink}
                onClick={() => setIsSidebarOpen(false)}
                style={{
                  background: isActive ? 'rgba(99,102,241,0.12)' : 'transparent',
                  color: isActive ? '#a5b4fc' : '#64748b',
                  borderLeft: isActive ? '2px solid #6366f1' : '2px solid transparent',
                }}
              >
                <span style={{ opacity: isActive ? 1 : 0.6 }}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className={styles.sidebarFooter}>
          <button className={styles.logoutBtn} onClick={handleLogout}>
            <IconLogout />
            Logout
          </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className={styles.mainContent}>
        {children}
      </main>
    </div>
  );
}
