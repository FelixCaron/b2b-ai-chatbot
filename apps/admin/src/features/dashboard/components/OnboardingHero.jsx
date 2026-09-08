import React from 'react';
import { Globe, RefreshCw, ArrowRight } from 'lucide-react';
import LogoMark from '../../../components/LogoMark';

export default function OnboardingHero({
  siteUrl,
  setSiteUrl,
  isAnalyzing,
  statusMsg,
  onSubmit,
  showSignIn = false,
  onSignIn
}) {
  return (
    <div className="relative max-w-2xl mx-auto mt-6 sm:mt-12">
      <div className="relative bg-white/70 backdrop-blur-sm p-6 sm:p-10 rounded-2xl border border-dark-900/10 text-center shadow-lg overflow-hidden">
        <div className="flex items-center justify-center gap-2.5 mb-4 sm:mb-6">
          <div className="w-9 h-9 sm:w-12 sm:h-12 text-brand-900 shrink-0 flex items-center justify-center">
            <LogoMark className="w-full h-full" />
          </div>
          <span className="text-2xl sm:text-3xl font-bold text-dark-900 tracking-tight lowercase">dorafi</span>
        </div>

        <h2 className="text-2xl sm:text-3xl font-bold text-dark-900 tracking-tight leading-tight mb-2.5 sm:mb-3">
          Turn your website into an AI assistant
        </h2>
        <p className="text-sm sm:text-base text-gray-500 mb-6 sm:mb-10 max-w-lg mx-auto">
          Enter your website address. We read your pages, learn what your business does, and build an assistant that can answer your visitors.
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="relative max-w-lg mx-auto">
            <Globe className="w-5 h-5 text-gray-500 absolute left-4 top-3.5 pointer-events-none" />
            <input
              type="text"
              placeholder="your-company.com"
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              className="w-full bg-surface-100 border border-gray-300 text-dark-900 rounded-2xl pl-12 pr-4 py-3.5 text-sm outline-none focus:border-brand-500 transition-colors shadow-inner"
              required
            />
          </div>

          <button
            type="submit"
            disabled={!siteUrl || isAnalyzing}
            className="w-full max-w-lg mx-auto bg-brand-600 hover:bg-brand-500 text-white font-medium py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-brand-900/40"
          >
            {isAnalyzing ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" /> Setting up your assistant...
              </span>
            ) : (
              <>Create My AI Assistant <ArrowRight className="w-4 h-4" /></>
            )}
          </button>
        </form>

        {/* One spinner, one message: the button above shows a generic
            "working" state, so this line only ever names the specific step
            underway (e.g. "Analyzing your website...") — never the same
            words twice. */}
        {statusMsg && (
          <div className="mt-6 flex items-center justify-center gap-3 text-sm text-brand-700 font-medium bg-brand-500/10 p-3 rounded-xl border border-brand-500/20">
            {isAnalyzing && <RefreshCw className="w-4 h-4 animate-spin" />}
            {statusMsg}
          </div>
        )}

        {showSignIn && (
          <p className="mt-6 text-xs text-gray-500">
            Already have an account?{' '}
            <button
              type="button"
              onClick={onSignIn}
              className="font-semibold text-brand-700 hover:text-brand-800 hover:underline"
            >
              Sign in
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
