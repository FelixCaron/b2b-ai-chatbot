import React from 'react';
import { Globe, RefreshCw, ArrowRight, AlertTriangle, BookOpen, MessageSquare, Code } from 'lucide-react';
import LogoMark from '../../../components/LogoMark';
import { useT } from '../../../i18n/LanguageContext';

// What actually happens after the button is pressed, in the order it happens.
// Someone handing over their website address deserves to know what we are
// about to do with it before they do it, not after — and each line says what
// it gets them, not what we run.
const WHAT_HAPPENS_NEXT = [
  {
    icon: BookOpen,
    title: 'We read your website',
    detail: 'Every page we can reach — services, pricing, FAQ, about. It takes a couple of minutes.'
  },
  {
    icon: MessageSquare,
    title: 'You test it yourself',
    detail: 'Ask it anything a visitor would ask, and correct what it gets wrong.'
  },
  {
    icon: Code,
    title: 'You add it to your website',
    detail: 'One line to paste. Then it answers your visitors, day and night.'
  }
];

export default function OnboardingHero({
  siteUrl,
  setSiteUrl,
  isAnalyzing,
  // The step underway, shown in the button and nowhere else — one spinner,
  // one message. Two of them used to run at once: a generic "Setting up your
  // assistant..." in the button and a specific step below it, which read as
  // two things loading rather than one thing progressing.
  stepMsg,
  // Only ever set when something actually failed.
  errorMsg,
  onSubmit,
  showSignIn = false,
  onSignIn
}) {
  const { t } = useT();
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
          {t('Turn your website into an AI assistant')}
        </h2>
        <p className="text-sm sm:text-base text-gray-500 mb-6 sm:mb-8 max-w-lg mx-auto">
          {t('Enter your website address. We read your pages, learn what your business does, and build an assistant that can answer your visitors.')}
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="relative max-w-lg mx-auto">
            <Globe className="w-5 h-5 text-gray-500 absolute left-4 top-3.5 pointer-events-none" />
            <input
              type="text"
              placeholder={t('your-company.com')}
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
                <RefreshCw className="w-4 h-4 animate-spin" />
                {stepMsg || t('Setting up your assistant...')}
              </span>
            ) : (
              <>{t('Create My AI Assistant')} <ArrowRight className="w-4 h-4" /></>
            )}
          </button>
        </form>

        <p className="mt-3 text-xs text-gray-500">
          {t('Free while you build and test it. No credit card.')}
        </p>

        {errorMsg && (
          <div className="mt-6 flex items-start justify-center gap-2.5 text-sm text-red-600 font-medium bg-red-500/10 p-3 rounded-xl border border-red-500/25 text-left">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* What happens next. Hidden once the work has started — at that point
            the button is narrating it live, and a list of what is about to
            happen is just noise on top of what IS happening. */}
        {!isAnalyzing && (
          <div className="mt-8 pt-6 border-t border-dark-900/5 grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
            {WHAT_HAPPENS_NEXT.map(({ icon: Icon, title, detail }, index) => (
              <div key={title} className="flex sm:flex-col items-start gap-3 sm:gap-2">
                <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 text-brand-700 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-dark-900">
                    <span className="text-brand-600">{index + 1}.</span> {t(title)}
                  </div>
                  <div className="text-[11px] text-gray-500 leading-relaxed mt-0.5">{t(detail)}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {showSignIn && (
          <p className="mt-6 text-xs text-gray-500">
            {t('Already have an account?')}{' '}
            <button
              type="button"
              onClick={onSignIn}
              className="font-semibold text-brand-700 hover:text-brand-800 hover:underline"
            >
              {t('Sign in')}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
