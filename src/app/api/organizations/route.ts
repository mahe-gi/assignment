import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query, pool } from '@/lib/db';

export async function GET() {
  try {
    const sessionUser = await getCurrentUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const res = await query(
      `SELECT 
        o.id,
        o.name,
        o.created_at,
        r.id as "roleId",
        r.name as "roleName",
        COALESCE(
          ARRAY_AGG(p.code) FILTER (WHERE p.code IS NOT NULL),
          ARRAY[]::VARCHAR[]
        ) as "permissions"
      FROM org_members om
      JOIN organizations o ON om.org_id = o.id
      JOIN roles r ON om.role_id = r.id
      LEFT JOIN role_permissions rp ON r.id = rp.role_id
      LEFT JOIN permissions p ON rp.permission_id = p.id
      WHERE om.user_id = $1
      GROUP BY o.id, o.name, o.created_at, r.id, r.name
      ORDER BY o.name ASC`,
      [sessionUser.userId]
    );

    return NextResponse.json({ organizations: res.rows });
  } catch (error: any) {
    console.error('List organizations error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const sessionUser = await getCurrentUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name } = await req.json();
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Organization name is required' }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const orgRes = await client.query(
        'INSERT INTO organizations (name) VALUES ($1) RETURNING id, name, created_at',
        [name.trim()]
      );
      const org = orgRes.rows[0];

      // Assign creator as ADMIN
      const adminRoleRes = await client.query("SELECT id FROM roles WHERE name = 'ADMIN'");
      const adminRoleId = adminRoleRes.rows[0]?.id || 1;

      await client.query(
        'INSERT INTO org_members (user_id, org_id, role_id) VALUES ($1, $2, $3)',
        [sessionUser.userId, org.id, adminRoleId]
      );

      await client.query('COMMIT');

      return NextResponse.json({ success: true, organization: org }, { status: 201 });
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Create organization error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
