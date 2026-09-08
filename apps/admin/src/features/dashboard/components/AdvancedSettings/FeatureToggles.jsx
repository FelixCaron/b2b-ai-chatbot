import React from 'react';
import { ShieldCheck, ToggleLeft, ToggleRight, Settings2, Sparkles, Lock, RefreshCw } from 'lucide-react';

/** 1. Feature Toggles Grid */
export default function FeatureToggles({
  activeSite,
  selectedTenant,
  themeColor,
  onUpdateSiteSettings,
  onRecrawl,
  isCrawling
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Rescan Website — was a top-level dashboard button; it's a
          maintenance action on this site's knowledge, so it lives with the
          rest of the settings that shape it. */}
      <div className="bg-surface-100 p-5 rounded-xl border border-dark-900/5 flex items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-bold text-dark-900 flex items-center gap-2 mb-1">
            <RefreshCw className="w-4 h-4 text-brand-600" /> Update Website Knowledge
          </h4>
          <p className="text-xs text-gray-500">Re-reads your website from scratch and refreshes what your assistant knows.</p>
        </div>

        <button
          type="button"
          onClick={onRecrawl}
          disabled={isCrawling}
          className="shrink-0 bg-white hover:bg-surface-200 disabled:opacity-60 disabled:cursor-not-allowed border border-dark-900/10 text-gray-700 hover:text-dark-900 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isCrawling ? 'animate-spin text-brand-600' : ''}`} />
          {isCrawling ? 'Rescanning…' : 'Rescan'}
        </button>
      </div>

      {/* Lead Capture Toggle */}
      <div className="bg-surface-100 p-5 rounded-xl border border-dark-900/5 flex items-center justify-between">
        <div>
          <h4 className="text-sm font-bold text-dark-900 flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-brand-600" /> Lead Capture & Email Collection
          </h4>
          <p className="text-xs text-gray-500">
            Automatically prompts visitors for email and contact info.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onUpdateSiteSettings(activeSite.id, { enable_lead_capture: !activeSite.enable_lead_capture })}
          className="p-1 cursor-pointer transition-transform hover:scale-105"
          role="switch"
          aria-checked={!!activeSite.enable_lead_capture}
          aria-label="Toggle lead capture & email collection"
        >
          {activeSite.enable_lead_capture ? (
            <ToggleRight className="w-9 h-9 text-emerald-600" />
          ) : (
            <ToggleLeft className="w-9 h-9 text-gray-500" />
          )}
        </button>
      </div>

      {/* Widget Color */}
      <div className="bg-surface-100 p-5 rounded-xl border border-dark-900/5 flex items-center justify-between">
        <div>
          <h4 className="text-sm font-bold text-dark-900 flex items-center gap-2 mb-1">
            <Settings2 className="w-4 h-4 text-brand-600" /> Widget Accent Color
          </h4>
          <p className="text-xs text-gray-500">Match your brand styling.</p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="color"
            value={themeColor}
            onChange={(e) => onUpdateSiteSettings(activeSite.id, { theme_primary_color: e.target.value })}
            className="w-9 h-9 rounded-xl border-0 bg-transparent cursor-pointer"
          />
        </div>
      </div>

      {/* Bot Goal */}
      <div className="bg-surface-100 p-5 rounded-xl border border-dark-900/5 flex items-center justify-between">
        <div>
          <h4 className="text-sm font-bold text-dark-900 flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-emerald-600" /> Primary Objective
          </h4>
          <p className="text-xs text-gray-500">AI conversation focus.</p>
        </div>

        <select
          value={activeSite.bot_goal || 'support'}
          onChange={(e) => onUpdateSiteSettings(activeSite.id, { bot_goal: e.target.value })}
          className="bg-white border border-gray-300 text-dark-900 text-xs rounded-lg px-3 py-2 outline-none"
        >
          <option value="support">Information & Support</option>
          <option value="lead">Lead Generation & Sales</option>
        </select>
      </div>

      {/* Bot Tone */}
      <div className="bg-surface-100 p-5 rounded-xl border border-dark-900/5 flex items-center justify-between">
        <div>
          <h4 className="text-sm font-bold text-dark-900 flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-emerald-600" /> Voice Tone
          </h4>
          <p className="text-xs text-gray-500">Personality & communication style.</p>
        </div>

        <select
          value={activeSite.bot_tone || 'professionnel'}
          onChange={(e) => onUpdateSiteSettings(activeSite.id, { bot_tone: e.target.value })}
          className="bg-white border border-gray-300 text-dark-900 text-xs rounded-lg px-3 py-2 outline-none"
        >
          <option value="professionnel">Professional & Courteous</option>
          <option value="amical">Warm & Friendly</option>
        </select>
      </div>

      {/* PRO Integrations: Support Email & Calendar Link */}
      <div className="bg-surface-100 p-5 rounded-xl border border-brand-500/20 flex flex-col gap-4 relative overflow-hidden">
        {selectedTenant?.plan !== 'pro' && selectedTenant?.plan !== 'premium' && (
          <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center p-4 text-center">
            <Lock className="w-6 h-6 text-brand-400 mb-2" />
            <h4 className="text-sm font-bold text-white">Pro Feature</h4>
            <p className="text-xs text-gray-400 mb-3 max-w-[250px]">Upgrade to Pro or Premium to unlock calendar integrations and support email forwarding.</p>
          </div>
        )}

        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-5 h-5 text-brand-600" />
          <h4 className="text-base font-bold text-dark-900">Pro Integrations</h4>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Support Email</label>
            <input
              type="email"
              placeholder="support@yourcompany.com"
              value={activeSite.support_email || ''}
              onChange={(e) => onUpdateSiteSettings(activeSite.id, { support_email: e.target.value })}
              className="w-full bg-white border border-gray-300 text-dark-900 text-sm rounded-lg px-4 py-2.5 outline-none focus:border-brand-500/50"
            />
            <p className="text-[10px] text-gray-500 mt-1">Where the assistant sends support requests.</p>
          </div>

          <div className="flex-1">
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Calendar Link</label>
            <input
              type="url"
              placeholder="https://calendly.com/your-name"
              value={activeSite.calendar_link || ''}
              onChange={(e) => onUpdateSiteSettings(activeSite.id, { calendar_link: e.target.value })}
              className="w-full bg-white border border-gray-300 text-dark-900 text-sm rounded-lg px-4 py-2.5 outline-none focus:border-brand-500/50"
            />
            <p className="text-[10px] text-gray-500 mt-1">Calendly, Cal.com, or Google Calendar link.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
