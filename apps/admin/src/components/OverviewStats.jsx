import React from 'react';
import { MessageSquare, UserCheck, Globe, Zap } from 'lucide-react';

export default function OverviewStats({ tenant, sitesCount, usage, leadsCount }) {
  const messagesCount = usage?.messages_count || 0;
  const plan = tenant?.plan || 'free';
  const quota = plan === 'pro' ? 50000 : plan === 'enterprise' ? 1000000 : 1000;
  const usagePercentage = Math.min(100, Math.round((messagesCount / quota) * 100));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {/* Stat 1: Messages Sent */}
      <div className="glass-card p-6 rounded-2xl">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-gray-400">Messages Échangés</span>
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <MessageSquare className="w-5 h-5" />
          </div>
        </div>
        <div className="text-3xl font-extrabold text-white mb-2">{messagesCount}</div>
        <div className="w-full bg-dark-900 rounded-full h-2 overflow-hidden mb-2">
          <div className="bg-gradient-to-r from-brand-600 to-indigo-400 h-2 rounded-full transition-all duration-500" style={{ width: `${usagePercentage}%` }}></div>
        </div>
        <div className="text-xs text-gray-400 flex justify-between">
          <span>{usagePercentage}% du forfait</span>
          <span>Max: {quota.toLocaleString()}</span>
        </div>
      </div>

      {/* Stat 2: Captured Leads */}
      <div className="glass-card p-6 rounded-2xl">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-gray-400">Prospects Capturés</span>
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <UserCheck className="w-5 h-5" />
          </div>
        </div>
        <div className="text-3xl font-extrabold text-white mb-2">{leadsCount}</div>
        <span className="text-xs text-emerald-400 font-medium">✓ Transmission automatique</span>
      </div>

      {/* Stat 3: Registered Sites */}
      <div className="glass-card p-6 rounded-2xl">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-gray-400">Sites Actifs</span>
          <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Globe className="w-5 h-5" />
          </div>
        </div>
        <div className="text-3xl font-extrabold text-white mb-2">{sitesCount}</div>
        <span className="text-xs text-gray-400">Assistant configuré et protégé</span>
      </div>

      {/* Stat 4: Plan Status */}
      <div className="glass-card p-6 rounded-2xl">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-gray-400">Abonnement Actif</span>
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Zap className="w-5 h-5" />
          </div>
        </div>
        <div className="text-3xl font-extrabold text-white mb-2 capitalize">{plan}</div>
        <span className="text-xs text-amber-400 font-medium">Support et LLM prioritaires</span>
      </div>
    </div>
  );
}
