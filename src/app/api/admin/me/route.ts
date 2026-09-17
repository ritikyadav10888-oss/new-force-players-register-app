import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { isAdminContext, requireAdmin, unauthorizedResponse } from '@/lib/auth/admin';

/** Current admin profile from Cloud SQL allowlist (used by login + layouts). */
export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { rows } = await query<{
      user_id: string;
      role: string | null;
      email: string | null;
      display_name: string | null;
      logo_url: string | null;
    }>(
      `SELECT user_id, role, email, display_name, logo_url
       FROM admin_users WHERE user_id = $1 LIMIT 1`,
      [auth.userId]
    );
    const row = rows[0];
    if (!row) return unauthorizedResponse('not_allowlisted');

    return NextResponse.json({
      userId: auth.userId,
      email: auth.email || row.email || undefined,
      role: row.role === 'customer' ? 'customer' : 'superadmin',
      displayName: row.display_name,
      logoUrl: row.logo_url,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load admin profile';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
