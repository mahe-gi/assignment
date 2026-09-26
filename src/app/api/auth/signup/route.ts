import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query, pool } from '@/lib/db';
import { signToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { name, email, password, orgName } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: 'Name, email, and password are required' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if user already exists
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existingUser.rows.length > 0) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Please log in.' },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Create User
      const userRes = await client.query(
        'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, created_at',
        [name.trim(), normalizedEmail, passwordHash]
      );
      const user = userRes.rows[0];

      // 2. Create Organization if specified (Default to "[Name]'s Workspace" if omitted)
      const targetOrgName = orgName?.trim() || `${user.name}'s Org`;
      let orgRes = await client.query(
        'INSERT INTO organizations (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id, name',
        [targetOrgName]
      );
      const org = orgRes.rows[0];

      // 3. Find ADMIN role
      const adminRoleRes = await client.query("SELECT id FROM roles WHERE name = 'ADMIN'");
      const adminRoleId = adminRoleRes.rows[0]?.id || 1;

      // 4. Add user as ADMIN in org_members
      await client.query(
        'INSERT INTO org_members (user_id, org_id, role_id) VALUES ($1, $2, $3) ON CONFLICT (user_id, org_id) DO NOTHING',
        [user.id, org.id, adminRoleId]
      );

      await client.query('COMMIT');

      // Sign JWT & set cookie
      const token = await signToken({
        userId: user.id,
        email: user.email,
        name: user.name,
      });

      const response = NextResponse.json({
        success: true,
        user: { id: user.id, name: user.name, email: user.email },
        org: { id: org.id, name: org.name },
      });

      response.cookies.set('remo_auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });

      return response;
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Signup error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
