import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query, pool } from '@/lib/db';
import { getCurrentUser, signToken } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;

    const res = await query(
      `SELECT 
        i.id,
        i.email,
        i.status,
        i.token,
        i.created_at as "createdAt",
        o.id as "orgId",
        o.name as "orgName",
        r.id as "roleId",
        r.name as "roleName",
        u.name as "invitedByName"
      FROM invitations i
      JOIN organizations o ON i.org_id = o.id
      JOIN roles r ON i.role_id = r.id
      LEFT JOIN users u ON i.invited_by = u.id
      WHERE i.token = $1`,
      [token]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'Invitation link not found or invalid' }, { status: 404 });
    }

    const invite = res.rows[0];
    const sessionUser = await getCurrentUser();

    return NextResponse.json({
      invitation: invite,
      currentUser: sessionUser,
    });
  } catch (error: any) {
    console.error('Verify invite error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;
    const body = await req.json().catch(() => ({}));

    // Find invitation
    const inviteRes = await query(
      `SELECT i.*, o.name as org_name, r.name as role_name 
       FROM invitations i 
       JOIN organizations o ON i.org_id = o.id 
       JOIN roles r ON i.role_id = r.id 
       WHERE i.token = $1`,
      [token]
    );

    if (inviteRes.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid invitation token' }, { status: 404 });
    }

    const invite = inviteRes.rows[0];

    if (invite.status !== 'PENDING') {
      return NextResponse.json(
        { error: `This invitation has already been ${invite.status.toLowerCase()}.` },
        { status: 400 }
      );
    }

    const sessionUser = await getCurrentUser();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      let targetUserId: number;
      let userObj: { id: number; name: string; email: string };

      if (sessionUser) {
        // Option A: Logged-in user accepts invitation
        targetUserId = sessionUser.userId;
        userObj = { id: sessionUser.userId, name: sessionUser.name, email: sessionUser.email };
      } else {
        // Option B: New user onboarding via invitation
        const { name, password } = body;
        if (!password) {
          await client.query('ROLLBACK');
          return NextResponse.json(
            { error: 'Password is required to create your account and accept the invitation' },
            { status: 400 }
          );
        }

        // Check if user already exists
        const existing = await client.query('SELECT * FROM users WHERE email = $1', [invite.email]);
        if (existing.rows.length > 0) {
          await client.query('ROLLBACK');
          return NextResponse.json(
            { error: 'An account with this email already exists. Please log in first to accept this invitation.' },
            { status: 400 }
          );
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const newUserRes = await client.query(
          'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email',
          [name?.trim() || invite.email.split('@')[0], invite.email, passwordHash]
        );
        userObj = newUserRes.rows[0];
        targetUserId = userObj.id;
      }

      // Add to org_members
      await client.query(
        `INSERT INTO org_members (user_id, org_id, role_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, org_id) DO UPDATE SET role_id = EXCLUDED.role_id`,
        [targetUserId, invite.org_id, invite.role_id]
      );

      // Mark invitation as ACCEPTED
      await client.query(
        `UPDATE invitations SET status = 'ACCEPTED' WHERE id = $1`,
        [invite.id]
      );

      await client.query('COMMIT');

      // Issue token session if not already logged in
      const jwt = await signToken({
        userId: userObj.id,
        email: userObj.email,
        name: userObj.name,
      });

      const response = NextResponse.json({
        success: true,
        message: `Successfully joined ${invite.org_name} as ${invite.role_name}!`,
        orgId: invite.org_id,
      });

      response.cookies.set('remo_auth_token', jwt, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      });

      return response;
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Accept invite error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
