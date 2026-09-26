# Multi-Tenant Organization, RBAC & Invitation Management System

A production-ready, clean full-stack application demonstrating:
1. **Multi-Tenancy (Many-to-Many):** Users can belong to multiple organizations; organizations have multiple users.
2. **Role-Based Access Control (RBAC):** Explicit `roles`, `permissions`, `role_permissions`, and `org_members` junction table. Different roles per organization.
3. **Invitation Flow:** Admin can invite by email and role; generates unique secure tokens; pending invites table; public link acceptance flow for new and existing users.
4. **Organization Switcher:** Dynamic organization selector switching user context and recalculating permissions on the fly.

---

## ⚡ Quick Start

### Option 1: Docker (PostgreSQL Alpine + App)
```bash
# 1. Start the complete stack (Postgres + Node App)
docker compose up -d

# 2. Open in your browser:
# http://localhost:5050
```

### Option 2: Local Node + Docker PostgreSQL
```bash
# 1. Start PostgreSQL Alpine container
docker compose up postgres -d

# 2. Install dependencies & start server
npm install
npm start

# 3. Open in your browser:
# http://localhost:5050
```

---

## 🔑 Pre-Seeded Demo Accounts (Password: `password123`)

The database automatically initializes with sample data so you can test immediately:

| User | Email | Role & Context | What to Test |
| :--- | :--- | :--- | :--- |
| **Alice** | `alice@example.com` | **ADMIN** @ Acme Corporation | Can view members, send invites, remove members. |
| **Bob** | `bob@example.com` | **MEMBER** @ Acme Corporation | View-only. Notice the "Invite" and "Remove" buttons are disabled (no permission). |
| **Charlie** | `charlie@example.com` | **ADMIN** @ Beta Logistics <br> **MEMBER** @ Acme Corporation | **Multi-Org proof!** Switch orgs in the dropdown: permissions change dynamically. |

---

## 🗄️ Database Architecture (7 Tables)

```text
users <───────────┐
                  ▼
organizations <── org_members ──> roles <── role_permissions ──> permissions
      │                             ▲
      └───────> invitations ────────┘
```

1. **`users`**: Global identity (`id`, `name`, `email`, `password_hash`).
2. **`organizations`**: Tenants (`id`, `name`).
3. **`roles`**: Reusable roles (`ADMIN`, `MEMBER`, `VIEWER`).
4. **`permissions`**: Granular actions (`org:view_members`, `org:invite`, `org:remove_member`, `org:manage_roles`).
5. **`role_permissions`**: Maps permissions to roles.
6. **`org_members`**: **Junction table** (`user_id`, `org_id`, `role_id`).
7. **`invitations`**: Pending invitations (`org_id`, `email`, `role_id`, `token`, `status: PENDING/ACCEPTED/REVOKED`).

---

## 🚀 REST API Endpoints

### Auth
* `POST /api/auth/signup` - Register user (`name, email, password`)
* `POST /api/auth/login` - Authenticate (`email, password`)
* `GET /api/auth/me` - Current user profile

### Organizations
* `GET /api/organizations` - List all orgs current user belongs to (with their role in each)
* `POST /api/organizations` - Create new org (creator automatically becomes `ADMIN`)
* `GET /api/organizations/:orgId` - Org details and caller's active permissions

### Members & RBAC
* `GET /api/organizations/:orgId/members` - List members of org
* `DELETE /api/organizations/:orgId/members/:userId` - Remove member (*Requires `org:remove_member`*)
* `PATCH /api/organizations/:orgId/members/:userId/role` - Update member's role (*Requires `org:manage_roles`*)

### Invitations Flow
* `GET /api/organizations/:orgId/invitations` - List pending invitations
* `POST /api/organizations/:orgId/invitations` - Send invite (`email, role_id`) (*Requires `org:invite`*)
* `DELETE /api/organizations/:orgId/invitations/:inviteId` - Revoke pending invite
* `GET /api/invitations/:token` - Public lookup of invite link
* `POST /api/invitations/:token/accept` - Accept invite (new or logged-in user)
