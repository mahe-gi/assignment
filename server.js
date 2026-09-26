const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const { query, initDB } = require('./db');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-for-remo-test';
const PORT = process.env.PORT || 5050;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// -------------------------------------------------------------
// Authentication Middleware
// -------------------------------------------------------------
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// -------------------------------------------------------------
// RBAC Permission Helper Middleware
// -------------------------------------------------------------
async function requireOrgPermission(permissionCode) {
  return async (req, res, next) => {
    const orgId = req.params.orgId || req.body.orgId || req.query.orgId;
    if (!orgId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    try {
      // Find user's membership and associated role in this organization
      const memberRes = await query(
        `SELECT om.id, om.role_id, r.name as role_name
         FROM org_members om
         JOIN roles r ON om.role_id = r.id
         WHERE om.org_id = $1 AND om.user_id = $2`,
        [orgId, req.user.id]
      );

      if (memberRes.rows.length === 0) {
        return res.status(403).json({ error: 'You are not a member of this organization' });
      }

      const roleId = memberRes.rows[0].role_id;

      // Check if this role has the required permission
      const permRes = await query(
        `SELECT p.code FROM role_permissions rp
         JOIN permissions p ON rp.permission_id = p.id
         WHERE rp.role_id = $1 AND p.code = $2`,
        [roleId, permissionCode]
      );

      if (permRes.rows.length === 0) {
        return res.status(403).json({
          error: `Forbidden: Your role (${memberRes.rows[0].role_name}) lacks permission '${permissionCode}' in this organization`
        });
      }

      req.membership = memberRes.rows[0];
      next();
    } catch (err) {
      console.error('RBAC check error:', err);
      return res.status(500).json({ error: 'Internal server error during permission check' });
    }
  };
}

// -------------------------------------------------------------
// AUTH ROUTES
// -------------------------------------------------------------

// Sign Up
app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  try {
    const userCheck = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Email is already registered' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, created_at',
      [name, email.toLowerCase(), passwordHash]
    );

    const user = newUser.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({ message: 'User registered successfully', token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const userRes = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = userRes.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Get Current User Profile
app.get('/api/auth/me', authenticate, async (req, res) => {
  try {
    const userRes = await query('SELECT id, name, email, created_at FROM users WHERE id = $1', [req.user.id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(userRes.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// ORGANIZATIONS & MEMBERSHIPS ROUTES
// -------------------------------------------------------------

// List all organizations the current user belongs to (with their role in each)
app.get('/api/organizations', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT o.id, o.name, o.created_at, r.name as role_name, r.id as role_id,
              ARRAY_AGG(p.code) as permissions
       FROM organizations o
       JOIN org_members om ON o.id = om.org_id
       JOIN roles r ON om.role_id = r.id
       LEFT JOIN role_permissions rp ON r.id = rp.role_id
       LEFT JOIN permissions p ON rp.permission_id = p.id
       WHERE om.user_id = $1
       GROUP BY o.id, o.name, o.created_at, r.name, r.id
       ORDER BY o.name ASC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Create a new Organization (creator is automatically assigned ADMIN)
app.post('/api/organizations', authenticate, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Organization name is required' });
  }

  try {
    // 1. Insert Org
    const orgRes = await query(
      'INSERT INTO organizations (name) VALUES ($1) RETURNING *',
      [name.trim()]
    );
    const newOrg = orgRes.rows[0];

    // 2. Get ADMIN role ID
    const roleRes = await query("SELECT id FROM roles WHERE name = 'ADMIN'");
    const adminRoleId = roleRes.rows[0].id;

    // 3. Add current user as ADMIN in org_members
    await query(
      'INSERT INTO org_members (user_id, org_id, role_id) VALUES ($1, $2, $3)',
      [req.user.id, newOrg.id, adminRoleId]
    );

    res.status(201).json({
      message: 'Organization created successfully',
      organization: newOrg
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get organization details with caller's role & permissions
app.get('/api/organizations/:orgId', authenticate, async (req, res) => {
  const { orgId } = req.params;

  try {
    const orgRes = await query('SELECT * FROM organizations WHERE id = $1', [orgId]);
    if (orgRes.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const membershipRes = await query(
      `SELECT om.joined_at, r.id as role_id, r.name as role_name,
              ARRAY_AGG(p.code) as permissions
       FROM org_members om
       JOIN roles r ON om.role_id = r.id
       LEFT JOIN role_permissions rp ON r.id = rp.role_id
       LEFT JOIN permissions p ON rp.permission_id = p.id
       WHERE om.org_id = $1 AND om.user_id = $2
       GROUP BY om.joined_at, r.id, r.name`,
      [orgId, req.user.id]
    );

    if (membershipRes.rows.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this organization' });
    }

    res.json({
      organization: orgRes.rows[0],
      membership: membershipRes.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// MEMBERS MANAGEMENT
// -------------------------------------------------------------

// List members of an organization
app.get('/api/organizations/:orgId/members', authenticate, async (req, res) => {
  const { orgId } = req.params;

  try {
    // Verify caller is member
    const checkMember = await query(
      'SELECT id FROM org_members WHERE org_id = $1 AND user_id = $2',
      [orgId, req.user.id]
    );
    if (checkMember.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied: not a member of this organization' });
    }

    const result = await query(
      `SELECT om.id as membership_id, om.user_id, u.name, u.email, om.role_id, r.name as role_name, om.joined_at
       FROM org_members om
       JOIN users u ON om.user_id = u.id
       JOIN roles r ON om.role_id = r.id
       WHERE om.org_id = $1
       ORDER BY om.joined_at ASC`,
      [orgId]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove a member from the organization (Requires org:remove_member permission)
app.delete(
  '/api/organizations/:orgId/members/:targetUserId',
  authenticate,
  async (req, res, next) => (await requireOrgPermission('org:remove_member'))(req, res, next),
  async (req, res) => {
    const { orgId, targetUserId } = req.params;

    try {
      // Prevent user from removing themselves if they are the last admin
      if (parseInt(targetUserId) === req.user.id) {
        return res.status(400).json({ error: 'Cannot remove yourself via this route' });
      }

      const delRes = await query(
        'DELETE FROM org_members WHERE org_id = $1 AND user_id = $2 RETURNING id',
        [orgId, targetUserId]
      );

      if (delRes.rows.length === 0) {
        return res.status(404).json({ error: 'Member not found in this organization' });
      }

      res.json({ message: 'Member removed successfully' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Update member role (Requires org:manage_roles permission)
app.patch(
  '/api/organizations/:orgId/members/:targetUserId/role',
  authenticate,
  async (req, res, next) => (await requireOrgPermission('org:manage_roles'))(req, res, next),
  async (req, res) => {
    const { orgId, targetUserId } = req.params;
    const { role_id } = req.body;

    if (!role_id) {
      return res.status(400).json({ error: 'role_id is required' });
    }

    try {
      const updateRes = await query(
        'UPDATE org_members SET role_id = $1 WHERE org_id = $2 AND user_id = $3 RETURNING *',
        [role_id, orgId, targetUserId]
      );

      if (updateRes.rows.length === 0) {
        return res.status(404).json({ error: 'Member not found in this organization' });
      }

      res.json({ message: 'Role updated successfully', member: updateRes.rows[0] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// -------------------------------------------------------------
// INVITATIONS MANAGEMENT (The Hero Requirement!)
// -------------------------------------------------------------

// List pending invitations for an organization
app.get('/api/organizations/:orgId/invitations', authenticate, async (req, res) => {
  const { orgId } = req.params;

  try {
    // Verify membership
    const checkMember = await query(
      'SELECT id FROM org_members WHERE org_id = $1 AND user_id = $2',
      [orgId, req.user.id]
    );
    if (checkMember.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied: not a member' });
    }

    const result = await query(
      `SELECT i.id, i.email, i.token, i.status, i.created_at, r.name as role_name, r.id as role_id, u.name as invited_by_name
       FROM invitations i
       JOIN roles r ON i.role_id = r.id
       JOIN users u ON i.invited_by = u.id
       WHERE i.org_id = $1 AND i.status = 'PENDING'
       ORDER BY i.created_at DESC`,
      [orgId]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create an invitation (Requires org:invite permission)
app.post(
  '/api/organizations/:orgId/invitations',
  authenticate,
  async (req, res, next) => (await requireOrgPermission('org:invite'))(req, res, next),
  async (req, res) => {
    const { orgId } = req.params;
    const { email, role_id } = req.body;

    if (!email || !role_id) {
      return res.status(400).json({ error: 'Email and role_id are required' });
    }

    const cleanEmail = email.trim().toLowerCase();

    try {
      // 1. Check if user is ALREADY a member of this organization
      const existingMember = await query(
        `SELECT om.id FROM org_members om
         JOIN users u ON om.user_id = u.id
         WHERE om.org_id = $1 AND u.email = $2`,
        [orgId, cleanEmail]
      );

      if (existingMember.rows.length > 0) {
        return res.status(400).json({ error: 'This user is already a member of this organization' });
      }

      // 2. Check if there is already a PENDING invitation
      const existingInvite = await query(
        `SELECT id FROM invitations WHERE org_id = $1 AND email = $2 AND status = 'PENDING'`,
        [orgId, cleanEmail]
      );

      if (existingInvite.rows.length > 0) {
        return res.status(400).json({ error: 'A pending invitation already exists for this email' });
      }

      // 3. Generate unique invitation token
      const token = 'inv_' + crypto.randomBytes(16).toString('hex');

      const newInvite = await query(
        `INSERT INTO invitations (org_id, role_id, invited_by, email, token, status)
         VALUES ($1, $2, $3, $4, $5, 'PENDING')
         RETURNING *`,
        [orgId, role_id, req.user.id, cleanEmail, token]
      );

      // In production you would send an email. For demo/rapid test, return the invite token/link directly!
      const inviteUrl = `${req.protocol}://${req.get('host')}/#invite=${token}`;

      res.status(201).json({
        message: 'Invitation created successfully',
        invitation: newInvite.rows[0],
        inviteUrl
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  }
);

// Revoke a pending invitation (Requires org:invite permission)
app.delete(
  '/api/organizations/:orgId/invitations/:inviteId',
  authenticate,
  async (req, res, next) => (await requireOrgPermission('org:invite'))(req, res, next),
  async (req, res) => {
    const { orgId, inviteId } = req.params;

    try {
      const result = await query(
        `UPDATE invitations SET status = 'REVOKED'
         WHERE id = $1 AND org_id = $2 AND status = 'PENDING'
         RETURNING id`,
        [inviteId, orgId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Pending invitation not found' });
      }

      res.json({ message: 'Invitation revoked successfully' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Public route to inspect an invite token
app.get('/api/invitations/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const result = await query(
      `SELECT i.id, i.email, i.token, i.status, i.created_at,
              o.name as org_name, o.id as org_id,
              r.name as role_name,
              u.name as invited_by_name
       FROM invitations i
       JOIN organizations o ON i.org_id = o.id
       JOIN roles r ON i.role_id = r.id
       JOIN users u ON i.invited_by = u.id
       WHERE i.token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid invitation link' });
    }

    const invite = result.rows[0];
    if (invite.status !== 'PENDING') {
      return res.status(400).json({ error: `This invitation has already been ${invite.status.toLowerCase()}` });
    }

    res.json(invite);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Accept an invitation
app.post('/api/invitations/:token/accept', async (req, res) => {
  const { token } = req.params;
  const { name, password } = req.body; // If accepting as new user, or pass token in Authorization header if logged in

  try {
    // 1. Fetch valid invite
    const inviteRes = await query(
      `SELECT * FROM invitations WHERE token = $1 AND status = 'PENDING'`,
      [token]
    );

    if (inviteRes.rows.length === 0) {
      return res.status(400).json({ error: 'Invitation is invalid, expired, or already used' });
    }

    const invite = inviteRes.rows[0];
    let userId;

    // 2. Identify the user
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      // Logged in user accepting
      try {
        const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        userId = decoded.id;
      } catch (e) {
        return res.status(401).json({ error: 'Session expired. Please log in again.' });
      }
    } else {
      // Accepting without active session: check if email exists or create new
      const userRes = await query('SELECT id, password_hash FROM users WHERE email = $1', [invite.email]);
      if (userRes.rows.length > 0) {
        // User already exists, require password to accept
        if (!password) {
          return res.status(400).json({ error: 'An account with this email already exists. Please provide your password to accept.' });
        }
        const isMatch = await bcrypt.compare(password, userRes.rows[0].password_hash);
        if (!isMatch) {
          return res.status(401).json({ error: 'Incorrect password for existing account' });
        }
        userId = userRes.rows[0].id;
      } else {
        // Create new user
        if (!name || !password) {
          return res.status(400).json({ error: 'Name and password are required to create your account' });
        }
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        const newUser = await query(
          'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
          [name, invite.email, passwordHash]
        );
        userId = newUser.rows[0].id;
      }
    }

    // 3. Add to org_members (ON CONFLICT DO NOTHING in case already member)
    await query(
      `INSERT INTO org_members (user_id, org_id, role_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, org_id) DO UPDATE SET role_id = EXCLUDED.role_id`,
      [userId, invite.org_id, invite.role_id]
    );

    // 4. Mark invitation as ACCEPTED
    await query(
      `UPDATE invitations SET status = 'ACCEPTED' WHERE id = $1`,
      [invite.id]
    );

    // 5. Generate fresh auth token for instant access
    const userRow = await query('SELECT id, name, email FROM users WHERE id = $1', [userId]);
    const authToken = jwt.sign({ id: userId, email: userRow.rows[0].email }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      message: 'Invitation accepted successfully! You have joined the organization.',
      token: authToken,
      user: userRow.rows[0],
      org_id: invite.org_id
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// ROLES & PERMISSIONS LIST
// -------------------------------------------------------------
app.get('/api/roles', async (req, res) => {
  try {
    const rolesRes = await query(
      `SELECT r.id, r.name, r.description,
              ARRAY_AGG(p.code) as permissions
       FROM roles r
       LEFT JOIN role_permissions rp ON r.id = rp.role_id
       LEFT JOIN permissions p ON rp.permission_id = p.id
       GROUP BY r.id, r.name, r.description
       ORDER BY r.id ASC`
    );
    res.json(rolesRes.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start Server
async function start() {
  await initDB();
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(` Multi-Tenant Server running on http://localhost:${PORT}`);
    console.log(`====================================================`);
  });
}

start();
