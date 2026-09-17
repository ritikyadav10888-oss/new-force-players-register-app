import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { isAdminContext, requireSuperadmin, unauthorizedResponse } from '@/lib/auth/admin';

export async function GET(request: Request) {
  const auth = await requireSuperadmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const { rows } = await query(
      `SELECT * FROM contact_inquiries ORDER BY created_at DESC`
    );
    return NextResponse.json({ inquiries: rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load inquiries';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireSuperadmin(request);
  if (!isAdminContext(auth)) return unauthorizedResponse(auth.failure);

  try {
    const body = (await request.json()) as { id?: unknown };
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) {
      return NextResponse.json({ error: 'Missing inquiry id.' }, { status: 400 });
    }
    await query(`DELETE FROM contact_inquiries WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete inquiry';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
