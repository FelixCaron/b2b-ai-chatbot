import React from 'react';
import { CheckCircle2, RefreshCw, Check, Eye } from 'lucide-react';
import LogoMark from '../../../../components/LogoMark';

/** 3. DEDICATED LEARNING PROGRESS MODAL (POPUP WITH PROGRESS BAR) */
export default function LearningProgressModal({
  show,
  learningStep,
  learningDomain,
  learningProgress,
  crawlProgressMsg,
  onTestBot,
  onGoToDashboard
}) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[999999] bg-dark-900/55 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white p-8 sm:p-10 rounded-3xl w-full max-w-lg border border-dark-900/10 shadow-2xl relative text-center overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        {/* Soft brand-tinted backdrop — a crisp radial fade instead of a
            heavy blurred blob, which read as an unfinished grey smear on
            the white card. */}
        <div
          className="absolute inset-x-0 -top-16 h-56 pointer-events-none"
          style={{ background: 'radial-gradient(60% 100% at 50% 0%, rgba(41,63,104,0.08), rgba(41,63,104,0) 70%)' }}
        />

        {/* Brand Avatar */}
        <div className="relative mx-auto mb-6 flex justify-center">
          <div className="w-20 h-20 rounded-3xl bg-white flex items-center justify-center shadow-xl border border-dark-900/10">
            {learningStep === 4 ? (
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            ) : (
              <LogoMark className="w-10 h-10 text-brand-900 animate-pulse" />
            )}
          </div>
        </div>

        {/* Title & Description */}
        <h3 className="text-2xl font-bold text-dark-900 mb-2">
          {learningStep === 4 ? "🎉 Your assistant is ready!" : `Learning ${learningDomain || 'your website'}`}
        </h3>
        <p className="text-sm text-gray-500 mb-8 max-w-md mx-auto">
          {learningStep === 4
            ? `We've read your website and your assistant is ready to answer questions about it.`
            : `We're reading your pages and learning what your business does, so your assistant can answer visitors around the clock.`}
        </p>

        {/* Progress Bar */}
        <div className="space-y-2 mb-8 text-left">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-gray-600 flex items-center gap-2">
              {learningStep < 4 && <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand-600" />}
              {crawlProgressMsg || "Reading your website..."}
            </span>
            <span className="text-brand-700 font-mono">{learningProgress}%</span>
          </div>
          <div className="w-full h-3 bg-surface-200 rounded-full overflow-hidden border border-dark-900/10 p-0.5">
            <div
              className="h-full bg-gradient-to-r from-brand-600 via-brand-400 to-emerald-400 rounded-full transition-all duration-500 shadow-sm"
              style={{ width: `${learningProgress}%` }}
            />
          </div>
        </div>

        {/* Step Checklist */}
        <div className="bg-surface-100 p-4 rounded-2xl border border-dark-900/5 text-left space-y-3 mb-8">
          <div className="flex items-center gap-3 text-xs">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${learningStep >= 2 ? 'bg-emerald-500/20 text-emerald-700' : 'bg-brand-500/20 text-brand-700 animate-pulse'}`}>
              {learningStep >= 2 ? <Check className="w-3 h-3" /> : '1'}
            </div>
            <span className={learningStep >= 2 ? 'text-gray-600 font-medium' : 'text-dark-900 font-semibold'}>
              Finding your pages
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${learningStep >= 3 ? 'bg-emerald-500/20 text-emerald-700' : learningStep === 2 ? 'bg-brand-500/20 text-brand-700 animate-pulse' : 'bg-surface-200 text-gray-500'}`}>
              {learningStep >= 3 ? <Check className="w-3 h-3" /> : '2'}
            </div>
            <span className={learningStep >= 3 ? 'text-gray-600 font-medium' : learningStep === 2 ? 'text-dark-900 font-semibold' : 'text-gray-500'}>
              Reading what each page says
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${learningStep >= 4 ? 'bg-emerald-500/20 text-emerald-700' : learningStep === 3 ? 'bg-brand-500/20 text-brand-700 animate-pulse' : 'bg-surface-200 text-gray-500'}`}>
              {learningStep >= 4 ? <Check className="w-3 h-3" /> : '3'}
            </div>
            <span className={learningStep >= 4 ? 'text-gray-600 font-medium' : learningStep === 3 ? 'text-dark-900 font-semibold' : 'text-gray-500'}>
              Learning what your business does
            </span>
          </div>
        </div>

        {/* Completion Buttons */}
        {learningStep === 4 ? (
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={onTestBot}
              className="flex-1 bg-gradient-to-r from-brand-700 to-brand-500 hover:from-brand-600 hover:to-brand-400 text-white font-bold py-3.5 px-6 rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-brand-900/30 transition-all hover:scale-[1.02] active:scale-98"
            >
              <Eye className="w-4 h-4" /> Test your assistant →
            </button>
            <button
              onClick={onGoToDashboard}
              className="bg-white hover:bg-surface-200 border border-dark-900/10 text-gray-600 hover:text-dark-900 font-semibold py-3.5 px-5 rounded-xl text-sm transition-all"
            >
              Go to Dashboard
            </button>
          </div>
        ) : (
          <div className="text-xs text-gray-500">
            Please keep this window open while we finish reading your website...
          </div>
        )}
      </div>
    </div>
  );
}
