-- RemoAsset Multi-Tenant Database Schema

-- 1. Users Table (Global Identity)
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
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_org_name UNIQUE (name)
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

-- 5. Role-Permission Junction Table
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id INT REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INT REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- 6. Organization Members (Bridge between User, Organization, and Role)
CREATE TABLE IF NOT EXISTS org_members (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    org_id INT REFERENCES organizations(id) ON DELETE CASCADE,
    role_id INT REFERENCES roles(id),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_user_org UNIQUE (user_id, org_id)
);

-- 7. Invitations Table (For team invitation links and status tracking)
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

-- Seed Default Roles
INSERT INTO roles (id, name, description) VALUES
(1, 'ADMIN', 'Full control over the organization, members, and invites'),
(2, 'MEMBER', 'Standard member access with view permissions'),
(3, 'VIEWER', 'Read-only access')
ON CONFLICT (id) DO NOTHING;

-- Seed Default Permissions
INSERT INTO permissions (id, code, description) VALUES
(1, 'org:view_members', 'View members and organization details'),
(2, 'org:invite', 'Invite new members to the organization'),
(3, 'org:remove_member', 'Remove members from the organization'),
(4, 'org:manage_roles', 'Change member roles')
ON CONFLICT (id) DO NOTHING;

-- Map Permissions to Roles
-- ADMIN gets all permissions
INSERT INTO role_permissions (role_id, permission_id) VALUES
(1, 1), (1, 2), (1, 3), (1, 4)
ON CONFLICT DO NOTHING;

-- MEMBER gets view_members
INSERT INTO role_permissions (role_id, permission_id) VALUES
(2, 1)
ON CONFLICT DO NOTHING;

-- VIEWER gets view_members
INSERT INTO role_permissions (role_id, permission_id) VALUES
(3, 1)
ON CONFLICT DO NOTHING;
