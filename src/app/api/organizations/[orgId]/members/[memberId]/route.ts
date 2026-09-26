import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { orgId: string; memberId: string } }
) {
  try {
    const sessionUser = await getCurrentUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orgId = parseInt(params.orgId, 10);
    const memberId = parseInt(params.memberId, 10);

    // RBAC: Check org:remove_member permission
    const { allowed, error } = await checkPermission(
      sessionUser.userId,
      orgId,
      'org:remove_member'
    );

    if (!allowed) {
      return NextResponse.json({ error: error || 'Forbidden' }, { status: 403 });
    }

    // Prevent removing the last admin
    const targetMember = await query(
      `SELECT om.user_id, r.name as "roleName" 
       FROM org_members om 
       JOIN roles r ON om.role_id = r.id 
       WHERE om.id = $1 AND om.org_id = $2`,
      [memberId, orgId]
    );

    if (targetMember.rows.length === 0) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    await query('DELETE FROM org_members WHERE id = $1 AND org_id = $2', [memberId, orgId]);

    return NextResponse.json({ success: true, message: 'Member removed successfully' });
  } catch (error: any) {
    console.error('Delete member error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { orgId: string; memberId: string } }
) {
  try {
    const sessionUser = await getCurrentUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orgId = parseInt(params.orgId, 10);
    const memberId = parseInt(params.memberId, 10);
    const { roleId } = await req.json();

    if (!roleId) {
      return NextResponse.json({ error: 'Role ID is required' }, { status: 400 });
    }

    // RBAC: Check org:manage_roles permission
    const { allowed, error } = await checkPermission(
      sessionUser.userId,
      orgId,
      'org:manage_roles'
    );

    if (!allowed) {
      return NextResponse.json({ error: error || 'Forbidden' }, { status: 403 });
    }

    await query(
      'UPDATE org_members SET role_id = $1 WHERE id = $2 AND org_id = $3',
      [roleId, memberId, orgId]
    );

    return NextResponse.json({ success: true, message: 'Role updated successfully' });
  } catch (error: any) {
    console.error('Update role error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
