import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { isAdminContext, requireSuperadmin, unauthorizedResponse } from '@/lib/auth/admin';

const MAX_LOGO_CHARS = 1_500_000; // ~1.1MB base64 guard

/** List customer accounts (superadmin only). */
export async function GET(request: Request) {
  const auth = await requireSuperadmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { rows } = await query(
      `SELECT user_id, email, display_name, logo_url, created_at
       FROM admin_users
       WHERE role = 'customer'
       ORDER BY created_at DESC`
    );
    return NextResponse.json({ customers: rows });
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

    const { getAdminAuth } = await import('@/lib/firebase/admin');
    const firebaseAuth = await getAdminAuth();
    let createdUid: string;
    try {
      const created = await firebaseAuth.createUser({
        email,
        password,
        emailVerified: true,
        displayName: displayName || undefined,
      });
      createdUid = created.uid;
    } catch (createErr: unknown) {
      const message =
        createErr instanceof Error ? createErr.message : 'Failed to create customer account.';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    try {
      await query(
        `INSERT INTO admin_users (user_id, role, email, display_name, logo_url)
         VALUES ($1, 'customer', $2, $3, $4)`,
        [createdUid, email, displayName || null, logoUrl || null]
      );
    } catch (insertErr: unknown) {
      await firebaseAuth.deleteUser(createdUid).catch(() => undefined);
      const message = insertErr instanceof Error ? insertErr.message : 'Failed to save customer';
      return NextResponse.json({ error: message }, { status: 500 });
    }

    return NextResponse.json({
      customer: {
        user_id: createdUid,
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

    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;

    if (typeof body.displayName === 'string') {
      sets.push(`display_name = $${i++}`);
      vals.push(body.displayName.trim() || null);
    }
    if (typeof body.logoUrl === 'string') {
      if (body.logoUrl.length > MAX_LOGO_CHARS) {
        return NextResponse.json({ error: 'Logo image is too large. Use a smaller file.' }, { status: 400 });
      }
      sets.push(`logo_url = $${i++}`);
      vals.push(body.logoUrl || null);
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
    }

    vals.push(userId);
    await query(
      `UPDATE admin_users SET ${sets.join(', ')}
       WHERE user_id = $${i} AND role = 'customer'`,
      vals
    );

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update customer';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
