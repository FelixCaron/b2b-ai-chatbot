import React from 'react';
import Header from './Header';
import Footer from './Footer';

/** The page chrome for a signed-in staff session: header + nav, the routed
 *  page, and the footer. App.jsx decides what goes inside; this decides what
 *  it sits in. */
export default function AppShell({ email, activeTab, onTabChange, onLogout, children }) {
  return (
    <div className="min-h-screen bg-surface-100 text-dark-900">
      <Header email={email} activeTab={activeTab} onTabChange={onTabChange} onLogout={onLogout} />

      <main className="p-6">{children}</main>

      <Footer />
    </div>
  );
}
