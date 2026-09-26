'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface User {
  id: number;
  name: string;
  email: string;
}

interface Org {
  id: number;
  name: string;
  roleId: number;
  roleName: string;
  permissions: string[];
}

interface Member {
  memberId: number;
  userId: number;
  name: string;
  email: string;
  roleId: number;
  roleName: string;
  joinedAt: string;
}

interface Invitation {
  id: number;
  email: string;
  status: string;
  token: string;
  roleId: number;
  roleName: string;
  createdAt: string;
  invitedByName?: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [organizations, setOrganizations] = useState<Org[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Modals state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState(2); // 2 = MEMBER, 1 = ADMIN
  const [inviteLoading, setInviteLoading] = useState(false);
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState('');

  const [showCreateOrgModal, setShowCreateOrgModal] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [createOrgLoading, setCreateOrgLoading] = useState(false);

  // 1. Initial Load: User & Organizations
  useEffect(() => {
    async function loadInitialData() {
      try {
        setLoading(true);
        // Load User
        const userRes = await fetch('/api/auth/me');
        if (!userRes.ok) {
          router.push('/login');
          return;
        }
        const userData = await userRes.json();
        setUser(userData.user);

        // Load Orgs
        const orgRes = await fetch('/api/organizations');
        const orgData = await orgRes.json();

        if (orgData.organizations && orgData.organizations.length > 0) {
          setOrganizations(orgData.organizations);
          setSelectedOrgId(orgData.organizations[0].id);
        } else {
          setOrganizations([]);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadInitialData();
  }, [router]);

  // 2. Load Members & Invitations whenever selectedOrgId changes
  useEffect(() => {
    if (!selectedOrgId) return;

    async function loadOrgData() {
      setError('');
      try {
        // Fetch Members
        const memRes = await fetch(`/api/organizations/${selectedOrgId}/members`);
        const memData = await memRes.json();
        if (memRes.ok) {
          setMembers(memData.members || []);
        } else {
          setError(memData.error || 'Failed to load members');
        }

        // Fetch Invitations
        const invRes = await fetch(`/api/organizations/${selectedOrgId}/invitations`);
        const invData = await invRes.json();
        if (invRes.ok) {
          setInvitations(invData.invitations || []);
        }
      } catch (err: any) {
        setError(err.message);
      }
    }

    loadOrgData();
  }, [selectedOrgId]);

  const currentOrg = organizations.find((o) => o.id === selectedOrgId);
  const isAdmin = currentOrg?.roleName === 'ADMIN';
  const hasInvitePermission = currentOrg?.permissions?.includes('org:invite');
  const hasRemovePermission = currentOrg?.permissions?.includes('org:remove_member');

  // Handle Logout
  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  // Handle Invite Member
  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId) return;
    setInviteLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/organizations/${selectedOrgId}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, roleId: inviteRole }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send invite');
      }

      setGeneratedInviteUrl(data.invitation.inviteUrl);
      setNotice(`Invitation generated for ${inviteEmail}!`);

      // Refresh invitations list
      const invRes = await fetch(`/api/organizations/${selectedOrgId}/invitations`);
      const invData = await invRes.json();
      if (invRes.ok) setInvitations(invData.invitations || []);

      setInviteEmail('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setInviteLoading(false);
    }
  };

  // Handle Revoke Invite
  const handleRevokeInvite = async (inviteId: number) => {
    if (!selectedOrgId) return;
    if (!confirm('Are you sure you want to revoke this invitation?')) return;

    try {
      const res = await fetch(`/api/organizations/${selectedOrgId}/invitations/${inviteId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setInvitations(invitations.filter((i) => i.id !== inviteId));
        setNotice('Invitation revoked.');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Handle Remove Member
  const handleRemoveMember = async (memberId: number) => {
    if (!selectedOrgId) return;
    if (!confirm('Are you sure you want to remove this member from the organization?')) return;

    try {
      const res = await fetch(`/api/organizations/${selectedOrgId}/members/${memberId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setMembers(members.filter((m) => m.memberId !== memberId));
        setNotice('Member removed successfully.');
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to remove member');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Handle Create Organization
  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateOrgLoading(true);
    setError('');

    try {
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newOrgName }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create organization');
      }

      // Refresh orgs list
      const orgRes = await fetch('/api/organizations');
      const orgData = await orgRes.json();
      if (orgData.organizations) {
        setOrganizations(orgData.organizations);
        setSelectedOrgId(data.organization.id);
      }

      setShowCreateOrgModal(false);
      setNewOrgName('');
      setNotice(`Created "${data.organization.name}"! You are the Admin.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreateOrgLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-slate-600 font-medium">Loading RemoAsset Platform...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Navbar */}
      <header className="bg-slate-900 text-white border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Org Selector */}
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2">
              <span className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center font-bold text-white text-lg">
                R
              </span>
              <span className="font-bold text-lg tracking-tight">RemoAsset</span>
            </div>

            {/* Organizations Dropdown */}
            {organizations.length > 0 && (
              <div className="flex items-center space-x-2 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
                <span className="text-xs text-slate-400 font-medium">Org:</span>
                <select
                  value={selectedOrgId || ''}
                  onChange={(e) => setSelectedOrgId(Number(e.target.value))}
                  className="bg-transparent text-sm font-semibold text-white focus:outline-none cursor-pointer"
                >
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id} className="bg-slate-900 text-white">
                      {org.name} ({org.roleName})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={() => setShowCreateOrgModal(true)}
              className="text-xs text-orange-400 hover:text-orange-300 font-medium flex items-center space-x-1"
            >
              <span>+ New Org</span>
            </button>
          </div>

          {/* User Profile & Logout */}
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <div className="text-sm font-semibold text-white">{user?.name}</div>
              <div className="text-xs text-slate-400">{user?.email}</div>
            </div>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Alerts */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError('')} className="font-bold text-red-500 hover:text-red-700">
              ✕
            </button>
          </div>
        )}

        {notice && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm flex justify-between items-center">
            <span>{notice}</span>
            <button onClick={() => setNotice('')} className="font-bold text-emerald-600 hover:text-emerald-800">
              ✕
            </button>
          </div>
        )}

        {/* Organization Info Banner */}
        {currentOrg ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center space-x-3">
                <h2 className="text-2xl font-bold text-slate-900">{currentOrg.name}</h2>
                <span
                  className={`px-2.5 py-1 text-xs font-semibold rounded-full uppercase tracking-wider ${
                    isAdmin
                      ? 'bg-orange-100 text-orange-700 border border-orange-200'
                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  Your Role: {currentOrg.roleName}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                <span className="font-semibold text-slate-600">Granted Permissions:</span>
                {currentOrg.permissions?.map((p) => (
                  <span key={p} className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono text-[10px]">
                    {p}
                  </span>
                ))}
              </p>
            </div>

            {/* Action buttons */}
            <div>
              {hasInvitePermission ? (
                <button
                  onClick={() => {
                    setGeneratedInviteUrl('');
                    setShowInviteModal(true);
                  }}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-medium text-sm rounded-lg shadow transition flex items-center space-x-2"
                >
                  <span>+ Invite Member</span>
                </button>
              ) : (
                <div className="text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                  🔒 Member access (Inviting disabled by RBAC)
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white p-8 rounded-xl text-center border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800">No Organization Selected</h3>
            <p className="text-sm text-slate-500 mt-1 mb-4">You do not belong to any organization yet.</p>
            <button
              onClick={() => setShowCreateOrgModal(true)}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-semibold hover:bg-orange-700"
            >
              + Create Organization
            </button>
          </div>
        )}

        {/* Section 1: Members Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
            <div>
              <h3 className="text-base font-bold text-slate-900">Organization Members</h3>
              <p className="text-xs text-slate-500">Active users belonging to {currentOrg?.name}</p>
            </div>
            <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-semibold">
              {members.length} {members.length === 1 ? 'member' : 'members'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                <tr>
                  <th className="px-6 py-3">Member</th>
                  <th className="px-6 py-3">Email</th>
                  <th className="px-6 py-3">Role</th>
                  <th className="px-6 py-3">Joined Date</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                      No members in this organization yet.
                    </td>
                  </tr>
                ) : (
                  members.map((m) => (
                    <tr key={m.memberId} className="hover:bg-slate-50 transition">
                      <td className="px-6 py-4 font-medium text-slate-900 flex items-center space-x-2">
                        <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs uppercase">
                          {m.name.charAt(0)}
                        </div>
                        <span>
                          {m.name} {m.userId === user?.id && <span className="text-xs text-orange-600 font-semibold">(You)</span>}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{m.email}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            m.roleName === 'ADMIN'
                              ? 'bg-orange-100 text-orange-700 border border-orange-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {m.roleName}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        {new Date(m.joinedAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {hasRemovePermission && m.userId !== user?.id ? (
                          <button
                            onClick={() => handleRemoveMember(m.memberId)}
                            className="text-xs text-red-600 hover:text-red-800 font-medium hover:underline"
                          >
                            Remove
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 2: Pending Invitations Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
            <div>
              <h3 className="text-base font-bold text-slate-900">Pending Invitations</h3>
              <p className="text-xs text-slate-500">Invites waiting for acceptance</p>
            </div>
            <span className="text-xs bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full font-semibold">
              {invitations.length} pending
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                <tr>
                  <th className="px-6 py-3">Invited Email</th>
                  <th className="px-6 py-3">Target Role</th>
                  <th className="px-6 py-3">Invited By</th>
                  <th className="px-6 py-3">Sent Date</th>
                  <th className="px-6 py-3">Invite Link</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invitations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                      No pending invitations. Click "+ Invite Member" to generate an invitation link.
                    </td>
                  </tr>
                ) : (
                  invitations.map((inv) => {
                    const inviteUrl = `${window.location.origin}/invite/${inv.token}`;
                    return (
                      <tr key={inv.id} className="hover:bg-slate-50 transition">
                        <td className="px-6 py-4 font-medium text-slate-900">{inv.email}</td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            {inv.roleName}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-500">
                          {inv.invitedByName || 'Admin'}
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-500">
                          {new Date(inv.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(inviteUrl);
                                setNotice(`Copied link for ${inv.email}!`);
                              }}
                              className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium border border-slate-200 flex items-center space-x-1"
                            >
                              <span>📋 Copy Link</span>
                            </button>
                            <Link
                              href={`/invite/${inv.token}`}
                              target="_blank"
                              className="text-xs text-orange-600 hover:underline"
                            >
                              Open ↗
                            </Link>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {hasInvitePermission ? (
                            <button
                              onClick={() => handleRevokeInvite(inv.id)}
                              className="text-xs text-red-600 hover:text-red-800 font-medium hover:underline"
                            >
                              Revoke
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* MODAL 1: Invite Member */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900">Invite Team Member</h3>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            {generatedInviteUrl ? (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
                  <div className="font-semibold mb-1">🎉 Invitation Generated!</div>
                  <p className="text-xs">
                    Share this unique link with the user to invite them to {currentOrg?.name}:
                  </p>
                  <div className="mt-2 p-2 bg-white rounded border border-emerald-300 font-mono text-xs break-all select-all">
                    {generatedInviteUrl}
                  </div>
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(generatedInviteUrl);
                      setNotice('Invite link copied to clipboard!');
                    }}
                    className="flex-1 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-semibold shadow"
                  >
                    Copy Link
                  </button>
                  <button
                    onClick={() => {
                      setGeneratedInviteUrl('');
                      setShowInviteModal(false);
                    }}
                    className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSendInvite} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Member Work Email
                  </label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@company.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Note: Admin does not set the user's password. The user sets it when accepting.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Assign Role
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value={2}>MEMBER (Standard view access)</option>
                    <option value={1}>ADMIN (Full management & invite rights)</option>
                  </select>
                </div>

                <div className="flex justify-end space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inviteLoading}
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {inviteLoading ? 'Generating...' : 'Generate Invite Link'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: Create Organization */}
      {showCreateOrgModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900">Create New Organization</h3>
              <button
                onClick={() => setShowCreateOrgModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateOrg} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Organization / Company Name
                </label>
                <input
                  type="text"
                  required
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="e.g. Acme EMEA Operations"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  You will automatically become the Admin of this new organization.
                </p>
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateOrgModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createOrgLoading}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {createOrgLoading ? 'Creating...' : 'Create Organization'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
