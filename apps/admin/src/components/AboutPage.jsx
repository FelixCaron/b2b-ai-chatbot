import React from 'react';
import { Sparkles, Globe, Shield, Rocket } from 'lucide-react';

export default function AboutPage() {
  return (
    <div className="py-12 px-6 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-6">
          Pioneering the Future of <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 to-indigo-500">B2B AI Assistants</span>
        </h1>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto">
          Point us at your website and, minutes later, an assistant that actually knows your business is live on it — greeting visitors, answering their questions, and following up so no opportunity slips through.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
        <div className="bg-dark-800/50 border border-white/10 p-8 rounded-3xl">
          <div className="w-12 h-12 bg-brand-500/10 border border-brand-500/20 rounded-xl flex items-center justify-center mb-6">
            <Rocket className="w-6 h-6 text-brand-400" />
          </div>
          <h3 className="text-xl font-bold text-white mb-3">Live in Minutes</h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            No setup, no training, no waiting on a developer. Give us your website's address and your assistant learns it on the spot, ready to chat the moment you hit publish.
          </p>
        </div>

        <div className="bg-dark-800/50 border border-white/10 p-8 rounded-3xl">
          <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center mb-6">
            <Globe className="w-6 h-6 text-emerald-400" />
          </div>
          <h3 className="text-xl font-bold text-white mb-3">Speaks Your Visitors' Language</h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            Wherever your customers come from, whatever language they type in, your assistant meets them there — no configuration required.
          </p>
        </div>

        <div className="bg-dark-800/50 border border-white/10 p-8 rounded-3xl">
          <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center justify-center mb-6">
            <Shield className="w-6 h-6 text-indigo-400" />
          </div>
          <h3 className="text-xl font-bold text-white mb-3">Your Business, Kept Private</h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            Everything your assistant learns and every conversation it has stays yours alone — completely walled off from every other business on the platform.
          </p>
        </div>

        <div className="bg-dark-800/50 border border-white/10 p-8 rounded-3xl">
          <div className="w-12 h-12 bg-sky-500/10 border border-sky-500/20 rounded-xl flex items-center justify-center mb-6">
            <Sparkles className="w-6 h-6 text-sky-400" />
          </div>
          <h3 className="text-xl font-bold text-white mb-3">More Than a Chat Window</h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            Your assistant does not just answer questions — it captures interested visitors' details, books time on your calendar, and hands off to a human exactly when needed.
          </p>
        </div>
      </div>
      
      <div className="text-center p-10 bg-gradient-to-br from-brand-900/40 to-indigo-900/40 border border-brand-500/30 rounded-3xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Globe className="w-32 h-32 text-brand-300" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-4 relative z-10">Ready to transform your customer experience?</h2>
        <p className="text-brand-200 mb-8 max-w-xl mx-auto relative z-10">
          Put an assistant on your site today and start turning visitors into conversations, and conversations into customers.
        </p>
        <button 
          onClick={() => window.dispatchEvent(new CustomEvent('b2b_tool_call', { detail: { name: 'navigate_to', args: { page: 'pricing' } } }))}
          className="bg-brand-600 hover:bg-brand-500 text-white px-8 py-3 rounded-xl font-bold transition-all hover:scale-105 active:scale-95 shadow-lg shadow-brand-900/50 relative z-10"
        >
          View Pricing Plans
        </button>
      </div>
    </div>
  );
}
