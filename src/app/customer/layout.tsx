'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Trophy } from 'lucide-react';
import { adminSignOut, getAdminIdToken, watchAdminAuth } from '@/lib/auth/admin-client';

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [brandName, setBrandName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const router = useRouter();

  useEffect(() => {
    const unsub = watchAdminAuth(async (user) => {
      if (!user) {
        router.replace('/admin/login');
        return;
      }
      const token = await getAdminIdToken();
      if (!token) {
        router.replace('/admin/login');
        return;
      }
      const res = await fetch('/api/admin/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        await adminSignOut();
        router.replace('/admin/login');
        return;
      }
      const me = await res.json();
      if (me.role !== 'customer') {
        router.replace('/admin');
        return;
      }
      setEmail(user.email || me.email || '');
      setBrandName(me.displayName || '');
      setLogoUrl(me.logoUrl || '');
      setReady(true);
    });
    return () => unsub();
  }, [router]);

  const handleLogout = async () => {
    await adminSignOut();
    router.push('/admin/login');
  };

  if (!ready) return null;

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--background)',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          padding: '1rem 1.5rem',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: 'var(--surface, #0d1117)',
          flexShrink: 0,
          zIndex: 50,
          boxShadow: '0 4px 20px -12px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              style={{
                width: '2.4rem',
                height: '2.4rem',
                borderRadius: '0.5rem',
                objectFit: 'cover',
                border: '1px solid rgba(255,255,255,0.12)',
              }}
            />
          ) : (
            <Trophy size={22} style={{ color: '#818cf8' }} />
          )}
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
            <span
              style={{
                background: 'linear-gradient(135deg,#818cf8,#c084fc)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                fontSize: '1.15rem',
                fontWeight: 800,
              }}
            >
              {brandName || 'Organizer Dashboard'}
            </span>
            {brandName && (
              <span style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 500 }}>Organizer Dashboard</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ color: '#94a3b8', fontSize: '0.85rem', display: 'none' }} className="cust-email">
            {email}
          </span>
          <button
            onClick={handleLogout}
            className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.9rem' }}
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      </header>
      <main style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 1.5rem' }}>{children}</div>
      </main>
    </div>
  );
}
