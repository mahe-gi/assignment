import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    const rolesRes = await query('SELECT id, name, description FROM roles ORDER BY id ASC');
    return NextResponse.json({ roles: rolesRes.rows });
  } catch (error: any) {
    console.error('Roles route error:', error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
