'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Trophy } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [brandName, setBrandName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const router = useRouter();

  useEffect(() => {
    const check = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/admin/login');
        return;
      }
      const { data: adminRow } = await supabase
        .from('admin_users')
        .select('role, display_name, logo_url')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (!adminRow) {
        await supabase.auth.signOut();
        router.replace('/admin/login');
        return;
      }
      if (adminRow.role !== 'customer') {
        // Superadmins belong in /admin
        router.replace('/admin');
        return;
      }
      setEmail(session.user.email || '');
      setBrandName(adminRow.display_name || '');
      setLogoUrl(adminRow.logo_url || '');
      setReady(true);
    };
    check();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
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
