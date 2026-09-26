'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function InviteAcceptPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [inviteData, setInviteData] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // New user onboarding fields
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    async function loadInvite() {
      try {
        const res = await fetch(`/api/invitations/${token}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to verify invitation');
        }
        setInviteData(data.invitation);
        setCurrentUser(data.currentUser);
        if (data.invitation?.email) {
          setName(data.invitation.email.split('@')[0]);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (token) {
      loadInvite();
    }
  }, [token]);

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch(`/api/invitations/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to accept invitation');
      }

      setSuccess(data.message || 'Invitation accepted!');
      setTimeout(() => {
        router.push('/');
        router.refresh();
      }, 1500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-slate-500 font-medium">Verifying invitation link...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-12 bg-slate-100">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-slate-200 p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-orange-100 text-orange-600 rounded-xl font-bold text-2xl mb-2">
            R
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Team Invitation</h1>
          <p className="text-sm text-slate-500 mt-1">You’ve been invited to collaborate</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg text-center">
            {success}
          </div>
        )}

        {inviteData && (
          <div>
            {/* Invite Details Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6 text-sm">
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-500">Organization:</span>
                <span className="font-semibold text-slate-800">{inviteData.orgName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-500">Assigned Role:</span>
                <span className="font-semibold text-orange-600">{inviteData.roleName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-500">Invited Email:</span>
                <span className="font-mono text-xs text-slate-700">{inviteData.email}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Status:</span>
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                  inviteData.status === 'PENDING' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'
                }`}>
                  {inviteData.status}
                </span>
              </div>
            </div>

            {inviteData.status !== 'PENDING' ? (
              <div className="text-center">
                <p className="text-sm text-slate-600 mb-4">
                  This invitation has already been {inviteData.status.toLowerCase()}.
                </p>
                <Link
                  href="/"
                  className="inline-block px-4 py-2 bg-slate-800 text-white rounded-lg text-sm hover:bg-slate-900"
                >
                  Go to Dashboard
                </Link>
              </div>
            ) : currentUser ? (
              /* Already logged in user accepting */
              <div className="space-y-4">
                {currentUser.email.toLowerCase() !== inviteData.email.toLowerCase() ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-lg space-y-2">
                    <p>
                      ⚠️ You are currently signed in as <strong>{currentUser.email}</strong>, but this invitation was sent to <strong>{inviteData.email}</strong>.
                    </p>
                    <div className="pt-2 border-t border-amber-200 flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await fetch('/api/auth/logout', { method: 'POST' });
                          window.location.reload();
                        }}
                        className="w-full py-2 bg-orange-600 hover:bg-orange-700 text-white rounded font-medium text-xs shadow"
                      >
                        Log Out to Register as {inviteData.email}
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleAccept}>
                    <div className="mb-4 p-3 bg-blue-50 text-blue-700 text-xs rounded-lg">
                      You are currently signed in as <strong>{currentUser.email}</strong>. Clicking accept will add this organization to your account.
                    </div>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-medium text-sm rounded-lg transition shadow disabled:opacity-50"
                    >
                      {submitting ? 'Joining Organization...' : `Join ${inviteData.orgName}`}
                    </button>
                  </form>
                )}
              </div>
            ) : (
              /* New user setting password */
              <form onSubmit={handleAccept} className="space-y-4">
                <p className="text-xs text-slate-500">
                  Set up your password to complete your account and join the team.
                </p>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Your Name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Set Password
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-medium text-sm rounded-lg transition shadow disabled:opacity-50"
                >
                  {submitting ? 'Setting up account...' : `Accept & Join ${inviteData.orgName}`}
                </button>
              </form>
            )}
          </div>
        )}

        <div className="mt-6 text-center text-xs text-slate-500">
          Already have another account?{' '}
          <Link href="/login" className="text-orange-600 font-medium hover:underline">
            Log in first
          </Link>
        </div>
      </div>
    </div>
  );
}
