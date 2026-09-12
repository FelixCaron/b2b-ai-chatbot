import React from 'react';
import LogoMark from '../LogoMark';

const TABS = [
  { id: 'tenants', label: 'Tenants' },
  { id: 'niches', label: 'Niches' },
  { id: 'staff', label: 'Staff' },
];

export default function Header({ email, activeTab, onTabChange, onLogout }) {
  return (
    <>
      <header className="border-b border-dark-900/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 text-brand-900 shrink-0 flex items-center justify-center">
            <LogoMark className="w-full h-full" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Dorafi — Staff Console</h1>
            <p className="text-xs text-gray-500">Signed in as {email}.</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="text-xs text-gray-500 hover:text-dark-900 px-3 py-1.5 rounded-lg border border-dark-900/10"
        >
          Sign out
        </button>
      </header>

      <nav className="px-6 pt-4 flex gap-2 border-b border-dark-900/5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`text-sm px-3 py-2 border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? 'border-brand-500 text-dark-900'
                : 'border-transparent text-gray-500 hover:text-gray-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </>
  );
}
