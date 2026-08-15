import React from 'react';
import { Star, Zap, Shield, Crown } from 'lucide-react';

const PLAN_CONFIG = {
  free: {
    label: 'Free',
    icon: null,
    className: 'bg-gray-500/15 text-gray-400 border-gray-500/25',
  },
  basic: {
    label: 'Basic',
    icon: Zap,
    className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  },
  starter: {
    label: 'Starter',
    icon: Star,
    className: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/25',
  },
  pro: {
    label: 'Pro',
    icon: Zap,
    className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  },
  enterprise: {
    label: 'Enterprise',
    icon: Crown,
    className: 'bg-brand-500/15 text-brand-400 border-brand-500/25',
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
 * @param {string} plan - 'free' | 'starter' | 'pro' | 'enterprise'
 * @param {string} planStatus - 'free' | 'active' | 'trialing' | 'past_due' | 'canceled'
 * @param {boolean} compact - If true, shows only the icon (for mobile)
 */
export default function PlanBadge({ plan = 'free', planStatus = 'free', compact = false }) {
  const config = PLAN_CONFIG[plan] || PLAN_CONFIG.free;
  const Icon = config.icon;
  const dotClass = STATUS_DOT[planStatus] || STATUS_DOT.free;

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border ${config.className}`}
        title={`Plan ${config.label} — ${planStatus}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
        {Icon && <Icon className="w-3 h-3" />}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${config.className}`}
      title={`Plan ${config.label} — ${planStatus}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
      {Icon && <Icon className="w-3 h-3" />}
      {config.label}
    </span>
  );
}
