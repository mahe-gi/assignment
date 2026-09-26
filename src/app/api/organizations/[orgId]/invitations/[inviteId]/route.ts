import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { orgId: string; inviteId: string } }
) {
  try {
    const sessionUser = await getCurrentUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orgId = parseInt(params.orgId, 10);
    const inviteId = parseInt(params.inviteId, 10);

    const { allowed, error } = await checkPermission(
      sessionUser.userId,
      orgId,
      'org:invite'
    );

    if (!allowed) {
      return NextResponse.json({ error: error || 'Forbidden' }, { status: 403 });
    }

    await query(
      `UPDATE invitations SET status = 'REVOKED' WHERE id = $1 AND org_id = $2`,
      [inviteId, orgId]
    );

    return NextResponse.json({ success: true, message: 'Invitation revoked successfully' });
  } catch (error: any) {
    console.error('Revoke invite error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
