import { NextRequest, NextResponse } from 'next/server';
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
    const { allowed, membership, error } = await checkPermission(
      sessionUser.userId,
      orgId,
      'org:view_members'
    );

    if (!allowed) {
      return NextResponse.json({ error: error || 'Forbidden' }, { status: 403 });
    }

    const membersRes = await query(
      `SELECT 
        om.id as "memberId",
        u.id as "userId",
        u.name,
        u.email,
        r.id as "roleId",
        r.name as "roleName",
        om.joined_at as "joinedAt"
      FROM org_members om
      JOIN users u ON om.user_id = u.id
      JOIN roles r ON om.role_id = r.id
      WHERE om.org_id = $1
      ORDER BY om.joined_at ASC`,
      [orgId]
    );

    return NextResponse.json({
      members: membersRes.rows,
      currentUserRole: membership?.roleName,
      currentUserPermissions: membership?.permissions,
    });
  } catch (error: any) {
    console.error('List members error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
