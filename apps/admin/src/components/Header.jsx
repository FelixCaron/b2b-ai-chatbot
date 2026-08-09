import React from 'react';
import { Bot, ShieldCheck, LogOut } from 'lucide-react';

export default function Header({ tenants, selectedTenant, setSelectedTenant, onLogout, onShowPricing }) {
  return (
    <header className="glass-card sticky top-0 z-50 px-4 sm:px-8 py-3 sm:py-4 mb-6 sm:mb-8">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-400 flex items-center justify-center text-white shadow-lg shadow-brand-500/30 shrink-0">
              <Bot className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h1 className="text-base sm:text-xl font-bold text-white tracking-tight">Plateforme Assistant IA</h1>
              <p className="text-[10px] sm:text-xs text-gray-400 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" /> Client Sécurisé
              </p>
            </div>
          </div>

          <button 
            onClick={onLogout}
            className="sm:hidden text-gray-400 hover:text-white p-2 rounded-lg hover:bg-white/5"
            title="Se déconnecter"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* Tenant Selector Dropdown & Upgrade */}
        <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 border-white/5 pt-2 sm:pt-0">
          <button
            onClick={onShowPricing}
            className="text-xs font-semibold bg-gradient-to-r from-brand-500 to-indigo-500 hover:from-brand-400 hover:to-indigo-400 text-white px-3.5 py-1.5 rounded-full transition-all shadow-md shadow-brand-500/20 shrink-0"
          >
            Upgrade / Forfaits
          </button>
          
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 font-medium hidden md:inline">Connecté :</span>
            <select
              value={selectedTenant?.id || ''}
              onChange={(e) => {
                const t = tenants.find((item) => item.id === e.target.value);
                if (t) setSelectedTenant(t);
              }}
              className="bg-dark-800 text-white border border-gray-700 rounded-lg px-2.5 py-1 text-xs sm:text-sm font-medium outline-none focus:border-brand-500 transition-colors cursor-pointer max-w-[140px] sm:max-w-[200px] truncate"
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          
          <button 
            onClick={onLogout}
            className="hidden sm:block text-gray-400 hover:text-white p-2 rounded-lg hover:bg-white/5 transition-colors"
            title="Se déconnecter"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
