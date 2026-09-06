import React from 'react';
import { ShieldAlert } from 'lucide-react';

export default function AccessDenied({ email, onLogout }) {
  return (
    <main className="min-h-screen bg-surface-100 flex items-center justify-center p-4">
      <div className="glass-card p-10 rounded-3xl w-full max-w-md border border-dark-900/10 text-center">
        <ShieldAlert className="w-10 h-10 text-amber-600 mx-auto mb-4" />
        <h1 className="text-lg font-bold text-dark-900">Not authorized</h1>
        <p className="text-gray-500 text-sm mt-2">
          {email} is signed in but isn't on the staff list for this console. Ask someone already on
          the list to add your account to <code className="text-gray-600">internal.staff_admins</code>.
        </p>
        <button
          onClick={onLogout}
          className="mt-6 text-sm text-gray-500 hover:text-dark-900 px-4 py-2 rounded-lg border border-dark-900/10"
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
