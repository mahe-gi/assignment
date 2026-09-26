import { query } from './db';

export interface OrgMembership {
  memberId: number;
  userId: number;
  orgId: number;
  roleId: number;
  roleName: string;
  permissions: string[];
}

/**
 * Retrieves the user's role and granted permissions in a specific organization.
 */
export async function getOrgMembership(userId: number, orgId: number): Promise<OrgMembership | null> {
  const result = await query(
    `SELECT 
      om.id as "memberId",
      om.user_id as "userId",
      om.org_id as "orgId",
      om.role_id as "roleId",
      r.name as "roleName",
      COALESCE(
        ARRAY_AGG(p.code) FILTER (WHERE p.code IS NOT NULL),
        ARRAY[]::VARCHAR[]
      ) as "permissions"
    FROM org_members om
    JOIN roles r ON om.role_id = r.id
    LEFT JOIN role_permissions rp ON r.id = rp.role_id
    LEFT JOIN permissions p ON rp.permission_id = p.id
    WHERE om.user_id = $1 AND om.org_id = $2
    GROUP BY om.id, om.user_id, om.org_id, om.role_id, r.name`,
    [userId, orgId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    memberId: row.memberId,
    userId: row.userId,
    orgId: row.orgId,
    roleId: row.roleId,
    roleName: row.roleName,
    permissions: row.permissions || [],
  };
}

/**
 * Validates if the user has a required permission within the specified organization.
 */
export async function checkPermission(
  userId: number,
  orgId: number,
  requiredPermission: string
): Promise<{ allowed: boolean; membership?: OrgMembership; error?: string }> {
  const membership = await getOrgMembership(userId, orgId);
  if (!membership) {
    return { allowed: false, error: 'User is not a member of this organization.' };
  }

  const allowed = membership.permissions.includes(requiredPermission);
  if (!allowed) {
    return {
      allowed: false,
      membership,
      error: `Access Denied: Missing '${requiredPermission}' permission. Current role: ${membership.roleName}`,
    };
  }

  return { allowed: true, membership };
}
