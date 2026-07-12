import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/service';
import { isAdminContext, requireSuperadmin, unauthorizedResponse } from '@/lib/auth/admin';

const MAX_LOGO_CHARS = 1_500_000; // ~1.1MB base64 guard

/** List customer accounts (superadmin only). */
export async function GET(request: Request) {
  const auth = await requireSuperadmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const db = getServiceSupabase();
    const { data, error } = await db
      .from('admin_users')
      .select('user_id, email, display_name, logo_url, created_at')
      .eq('role', 'customer')
      .order('created_at', { ascending: false });
    if (error) throw error;

    return NextResponse.json({ customers: data || [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load customers';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Create a new customer account (superadmin only). */
export async function POST(request: Request) {
  const auth = await requireSuperadmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const body = (await request.json()) as {
      email?: unknown;
      password?: unknown;
      displayName?: unknown;
      logoUrl?: unknown;
    };
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    const logoUrl = typeof body.logoUrl === 'string' ? body.logoUrl : '';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters.' },
        { status: 400 }
      );
    }
    if (logoUrl.length > MAX_LOGO_CHARS) {
      return NextResponse.json({ error: 'Logo image is too large. Use a smaller file.' }, { status: 400 });
    }

    const db = getServiceSupabase();

    const { data: created, error: createErr } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !created?.user) {
      return NextResponse.json(
        { error: createErr?.message || 'Failed to create customer account.' },
        { status: 400 }
      );
    }

    const { error: insertErr } = await db.from('admin_users').insert({
      user_id: created.user.id,
      role: 'customer',
      email,
      display_name: displayName || null,
      logo_url: logoUrl || null,
    });
    if (insertErr) {
      await db.auth.admin.deleteUser(created.user.id);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      customer: {
        user_id: created.user.id,
        email,
        display_name: displayName || null,
        logo_url: logoUrl || null,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create customer';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Update a customer's branding (superadmin only). */
export async function PATCH(request: Request) {
  const auth = await requireSuperadmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const body = (await request.json()) as {
      userId?: unknown;
      displayName?: unknown;
      logoUrl?: unknown;
    };
    const userId = typeof body.userId === 'string' ? body.userId : '';
    if (!userId) {
      return NextResponse.json({ error: 'Missing customer id.' }, { status: 400 });
    }

    const update: Record<string, string | null> = {};
    if (typeof body.displayName === 'string') update.display_name = body.displayName.trim() || null;
    if (typeof body.logoUrl === 'string') {
      if (body.logoUrl.length > MAX_LOGO_CHARS) {
        return NextResponse.json({ error: 'Logo image is too large. Use a smaller file.' }, { status: 400 });
      }
      update.logo_url = body.logoUrl || null;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
    }

    const db = getServiceSupabase();
    const { error } = await db
      .from('admin_users')
      .update(update)
      .eq('user_id', userId)
      .eq('role', 'customer');
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update customer';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
