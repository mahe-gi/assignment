-- 1. Users Table (Global user identity)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Organizations Table
CREATE TABLE IF NOT EXISTS organizations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Roles Table
CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT
);

-- 4. Permissions Table
CREATE TABLE IF NOT EXISTS permissions (
    id SERIAL PRIMARY KEY,
    code VARCHAR(100) UNIQUE NOT NULL,
    description TEXT
);

-- 5. Role Permissions (Mapping permissions to roles)
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id INT REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INT REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- 6. Org Members (Connecting User <-> Org <-> Role)
CREATE TABLE IF NOT EXISTS org_members (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    org_id INT REFERENCES organizations(id) ON DELETE CASCADE,
    role_id INT REFERENCES roles(id),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_user_org UNIQUE (user_id, org_id)
);

-- 7. Invitations Table (Pending invites with tokens)
CREATE TABLE IF NOT EXISTS invitations (
    id SERIAL PRIMARY KEY,
    org_id INT REFERENCES organizations(id) ON DELETE CASCADE,
    role_id INT REFERENCES roles(id),
    invited_by INT REFERENCES users(id),
    email VARCHAR(255) NOT NULL,
    token VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, ACCEPTED, REVOKED
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- SEED DATA

-- Permissions
INSERT INTO permissions (code, description) VALUES
    ('org:view_members', 'View members and organization details'),
    ('org:invite', 'Invite new members to the organization'),
    ('org:remove_member', 'Remove members from the organization'),
    ('org:manage_roles', 'Change member roles')
ON CONFLICT (code) DO NOTHING;

-- Roles
INSERT INTO roles (name, description) VALUES
    ('ADMIN', 'Full control over the organization, members, and invites'),
    ('MEMBER', 'Standard member access with view permissions'),
    ('VIEWER', 'Read-only access')
ON CONFLICT (name) DO NOTHING;

-- Assign Permissions to Roles
-- ADMIN gets all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'ADMIN'
ON CONFLICT DO NOTHING;

-- MEMBER gets view_members
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'MEMBER' AND p.code = 'org:view_members'
ON CONFLICT DO NOTHING;

-- VIEWER gets view_members
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'VIEWER' AND p.code = 'org:view_members'
ON CONFLICT DO NOTHING;

-- Demo Users (Password is 'password123' hashed with bcrypt: $2a$10$wO3r242nE0O5fXfO05Z6fe6MhNl5P90o85Z31xH2eP88jE3kM90oW or plain demo)
-- For maximum reliability across demo/test, we seed with bcrypt hash of 'password123'
INSERT INTO users (name, email, password_hash) VALUES
    ('Alice Admin', 'alice@example.com', '$2a$10$3JW/BST7FKHudjXY48au5O7i7Z/jPmp9zMPEFOn9EWyJZVtksH7Ya'),
    ('Bob Member', 'bob@example.com', '$2a$10$3JW/BST7FKHudjXY48au5O7i7Z/jPmp9zMPEFOn9EWyJZVtksH7Ya'),
    ('Charlie Multi-Org', 'charlie@example.com', '$2a$10$3JW/BST7FKHudjXY48au5O7i7Z/jPmp9zMPEFOn9EWyJZVtksH7Ya')
ON CONFLICT (email) DO NOTHING;

-- Demo Organizations
INSERT INTO organizations (name) VALUES
    ('Acme Corporation'),
    ('Beta Logistics')
ON CONFLICT DO NOTHING;

-- Demo Memberships (Shows Many-to-Many immediately!)
-- Alice: ADMIN at Acme
INSERT INTO org_members (user_id, org_id, role_id)
SELECT u.id, o.id, r.id FROM users u, organizations o, roles r
WHERE u.email = 'alice@example.com' AND o.name = 'Acme Corporation' AND r.name = 'ADMIN'
ON CONFLICT DO NOTHING;

-- Bob: MEMBER at Acme
INSERT INTO org_members (user_id, org_id, role_id)
SELECT u.id, o.id, r.id FROM users u, organizations o, roles r
WHERE u.email = 'bob@example.com' AND o.name = 'Acme Corporation' AND r.name = 'MEMBER'
ON CONFLICT DO NOTHING;

-- Charlie: ADMIN at Beta Logistics AND MEMBER at Acme Corporation!
INSERT INTO org_members (user_id, org_id, role_id)
SELECT u.id, o.id, r.id FROM users u, organizations o, roles r
WHERE u.email = 'charlie@example.com' AND o.name = 'Beta Logistics' AND r.name = 'ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO org_members (user_id, org_id, role_id)
SELECT u.id, o.id, r.id FROM users u, organizations o, roles r
WHERE u.email = 'charlie@example.com' AND o.name = 'Acme Corporation' AND r.name = 'MEMBER'
ON CONFLICT DO NOTHING;

-- Demo Invitation for Acme Corporation
INSERT INTO invitations (org_id, role_id, invited_by, email, token, status)
SELECT o.id, r.id, u.id, 'david.invitee@example.com', 'demo-invite-token-12345', 'PENDING'
FROM organizations o, roles r, users u
WHERE o.name = 'Acme Corporation' AND r.name = 'MEMBER' AND u.email = 'alice@example.com'
ON CONFLICT DO NOTHING;
