import React from 'react';
import { Star, Zap, Shield, Crown } from 'lucide-react';
import { getPlanDisplayName } from '@b2b-ai-chatbot/contracts';

// Icon/color are presentational only — the display label itself comes from
// @b2b-ai-chatbot/contracts (the one source of truth for plan naming), so a
// marketing rename never needs a second edit here.
const PLAN_CONFIG = {
  basic: {
    icon: Zap,
    className: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/25',
  },
  pro: {
    icon: Star,
    className: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/25',
  },
  premium: {
    icon: Crown,
    className: 'bg-brand-500/15 text-brand-700 border-brand-500/25',
  },
};

const STATUS_DOT = {
  active: 'bg-emerald-400',
  free: 'bg-gray-500',
  trialing: 'bg-yellow-400',
  past_due: 'bg-red-400 animate-pulse',
  canceled: 'bg-gray-600',
};

/**
 * PlanBadge — displays the tenant's current plan with status indicator.
 * @param {string} plan - 'basic' | 'pro' | 'premium'
 * @param {string} planStatus - 'free' | 'active' | 'trialing' | 'past_due' | 'canceled'
 * @param {boolean} compact - If true, shows only the icon (for mobile)
 */
export default function PlanBadge({ plan = 'basic', planStatus = 'free', compact = false }) {
  const config = PLAN_CONFIG[plan] || PLAN_CONFIG.basic;
  const label = getPlanDisplayName(plan);
  const Icon = config.icon;
  const dotClass = STATUS_DOT[planStatus] || STATUS_DOT.free;

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border ${config.className}`}
        title={`Plan ${label} — ${planStatus}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
        {Icon && <Icon className="w-3 h-3" />}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${config.className}`}
      title={`Plan ${label} — ${planStatus}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
      {Icon && <Icon className="w-3 h-3" />}
      {label}
    </span>
  );
}
