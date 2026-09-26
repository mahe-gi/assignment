import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET() {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
  }

  const userRes = await query('SELECT id, name, email, created_at FROM users WHERE id = $1', [
    sessionUser.userId,
  ]);

  if (userRes.rows.length === 0) {
    return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    user: userRes.rows[0],
  });
}
