'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to login');
      }

      router.push('/');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = async (quickEmail: string) => {
    setEmail(quickEmail);
    setPassword('password123');
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: quickEmail, password: 'password123' }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to login');
      }

      router.push('/');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-12 bg-slate-100">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-slate-200 p-8">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-orange-100 text-orange-600 rounded-xl font-bold text-2xl mb-2">
            R
          </div>
          <h1 className="text-2xl font-bold text-slate-800">RemoAsset Platform</h1>
          <p className="text-sm text-slate-500 mt-1">Multi-Tenant Team & Asset Management</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
            {error}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Work Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-medium text-sm rounded-lg transition shadow disabled:opacity-50"
          >
            {loading ? 'Logging in...' : 'Sign In'}
          </button>
        </form>

        {/* Demo Fast Login Buttons */}
        <div className="mt-6 pt-6 border-t border-slate-200">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 text-center">
            ⚡ Quick Demo Logins
          </p>
          <div className="grid grid-cols-1 gap-2 text-xs">
            <button
              onClick={() => quickLogin('alice@example.com')}
              className="p-2 border border-slate-200 rounded hover:bg-slate-50 text-left flex justify-between items-center"
            >
              <div>
                <span className="font-semibold text-slate-800">Alice Admin</span>
                <span className="block text-[11px] text-slate-500">Acme Corp (Admin)</span>
              </div>
              <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-mono">
                Log In
              </span>
            </button>
            <button
              onClick={() => quickLogin('bob@example.com')}
              className="p-2 border border-slate-200 rounded hover:bg-slate-50 text-left flex justify-between items-center"
            >
              <div>
                <span className="font-semibold text-slate-800">Bob Member</span>
                <span className="block text-[11px] text-slate-500">Acme Corp (Member)</span>
              </div>
              <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono">
                Log In
              </span>
            </button>
            <button
              onClick={() => quickLogin('charlie@example.com')}
              className="p-2 border border-slate-200 rounded hover:bg-slate-50 text-left flex justify-between items-center"
            >
              <div>
                <span className="font-semibold text-slate-800">Charlie Multi-Org</span>
                <span className="block text-[11px] text-slate-500">Acme (Member) & Beta (Admin)</span>
              </div>
              <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-mono">
                Log In
              </span>
            </button>
          </div>
        </div>

        {/* Link to Signup */}
        <div className="mt-6 text-center text-sm text-slate-600">
          New to RemoAsset?{' '}
          <Link href="/signup" className="text-orange-600 font-semibold hover:underline">
            Create an Organization
          </Link>
        </div>
      </div>
    </div>
  );
}
