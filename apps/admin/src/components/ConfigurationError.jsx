import React from 'react';

/** Shown instead of the app when the Vite bundle was built without a Supabase
 *  URL and publishable key — there is no session to boot and nothing to show. */
export default function ConfigurationError({ message }) {
  return (
    <main className="min-h-screen bg-surface-100 flex items-center justify-center p-6 text-dark-900">
      <div className="max-w-lg rounded-xl border border-red-300 bg-red-50 p-6">
        <h1 className="text-lg font-semibold">Configuration requise</h1>
        <p className="mt-2 text-sm text-red-700">{message}</p>
      </div>
    </main>
  );
}
