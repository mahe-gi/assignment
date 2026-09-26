import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';

export async function GET(
  req: NextRequest,
  { params }: { params: { orgId: string } }
) {
  try {
    const sessionUser = await getCurrentUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orgId = parseInt(params.orgId, 10);
    if (isNaN(orgId)) {
      return NextResponse.json({ error: 'Invalid organization ID' }, { status: 400 });
    }

    // RBAC: Check org:view_members permission
    const { allowed, error } = await checkPermission(
      sessionUser.userId,
      orgId,
      'org:view_members'
    );

    if (!allowed) {
      return NextResponse.json({ error: error || 'Forbidden' }, { status: 403 });
    }

    const invitesRes = await query(
      `SELECT 
        i.id,
        i.email,
        i.status,
        i.token,
        i.created_at as "createdAt",
        r.id as "roleId",
        r.name as "roleName",
        u.name as "invitedByName"
      FROM invitations i
      JOIN roles r ON i.role_id = r.id
      LEFT JOIN users u ON i.invited_by = u.id
      WHERE i.org_id = $1 AND i.status = 'PENDING'
      ORDER BY i.created_at DESC`,
      [orgId]
    );

    return NextResponse.json({ invitations: invitesRes.rows });
  } catch (error: any) {
    console.error('List invitations error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { orgId: string } }
) {
  try {
    const sessionUser = await getCurrentUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orgId = parseInt(params.orgId, 10);
    if (isNaN(orgId)) {
      return NextResponse.json({ error: 'Invalid organization ID' }, { status: 400 });
    }

    // RBAC: Check org:invite permission
    const { allowed, error } = await checkPermission(
      sessionUser.userId,
      orgId,
      'org:invite'
    );

    if (!allowed) {
      return NextResponse.json({ error: error || 'Forbidden' }, { status: 403 });
    }

    const { email, roleId } = await req.json();
    if (!email || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const targetRoleId = roleId || 2; // Default to MEMBER (id 2)

    // Check if user is already an active member of this organization
    const existingMember = await query(
      `SELECT om.id 
       FROM org_members om
       JOIN users u ON om.user_id = u.id
       WHERE om.org_id = $1 AND u.email = $2`,
      [orgId, normalizedEmail]
    );

    if (existingMember.rows.length > 0) {
      return NextResponse.json(
        { error: 'User with this email is already a member of this organization.' },
        { status: 400 }
      );
    }

    // Check if there is already an active PENDING invitation for this email in this org
    const existingInvite = await query(
      `SELECT id, token FROM invitations WHERE org_id = $1 AND email = $2 AND status = 'PENDING'`,
      [orgId, normalizedEmail]
    );

    if (existingInvite.rows.length > 0) {
      return NextResponse.json(
        { 
          error: 'An active invitation is already pending for this email.',
          invitation: existingInvite.rows[0]
        },
        { status: 400 }
      );
    }

    // Generate secure random token
    const token = 'inv_' + crypto.randomBytes(16).toString('hex');

    const result = await query(
      `INSERT INTO invitations (org_id, role_id, invited_by, email, token, status)
       VALUES ($1, $2, $3, $4, $5, 'PENDING')
       RETURNING id, org_id, role_id, email, token, status, created_at`,
      [orgId, targetRoleId, sessionUser.userId, normalizedEmail, token]
    );

    const invite = result.rows[0];
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    const proto = req.headers.get('x-forwarded-proto') || (host?.includes('localhost') ? 'http' : 'https');
    const origin = host ? `${proto}://${host}` : (req.nextUrl.origin || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001');
    const inviteUrl = `${origin}/invite/${token}`;

    return NextResponse.json({
      success: true,
      invitation: {
        ...invite,
        inviteUrl,
      },
    }, { status: 201 });
  } catch (error: any) {
    console.error('Create invitation error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
