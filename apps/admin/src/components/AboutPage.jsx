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
          We are on a mission to democratize enterprise-grade AI. Our platform empowers businesses of all sizes to deploy hyper-intelligent, agentic chatbots in minutes, not months.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
        <div className="bg-dark-800/50 border border-white/10 p-8 rounded-3xl">
          <div className="w-12 h-12 bg-brand-500/10 border border-brand-500/20 rounded-xl flex items-center justify-center mb-6">
            <Rocket className="w-6 h-6 text-brand-400" />
          </div>
          <h3 className="text-xl font-bold text-white mb-3">Velocity & Performance</h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            Built on a custom high-performance architecture, our GPT Luna engine ensures blazing-fast responses and seamless context management. Your customers get the answers they need instantly, driving higher conversion rates.
          </p>
        </div>

        <div className="bg-dark-800/50 border border-white/10 p-8 rounded-3xl">
          <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center mb-6">
            <Globe className="w-6 h-6 text-emerald-400" />
          </div>
          <h3 className="text-xl font-bold text-white mb-3">Global Scale</h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            From multilingual hybrid search capabilities to massive crawling scalability, we handle the infrastructure so you can focus on your core business. We support businesses around the world.
          </p>
        </div>

        <div className="bg-dark-800/50 border border-white/10 p-8 rounded-3xl">
          <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center justify-center mb-6">
            <Shield className="w-6 h-6 text-indigo-400" />
          </div>
          <h3 className="text-xl font-bold text-white mb-3">Enterprise Security</h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            Data privacy is our foundation. With strict tenant isolation and advanced RLS policies, your knowledge base and conversation histories are completely secure and isolated from other tenants.
          </p>
        </div>

        <div className="bg-dark-800/50 border border-white/10 p-8 rounded-3xl">
          <div className="w-12 h-12 bg-sky-500/10 border border-sky-500/20 rounded-xl flex items-center justify-center mb-6">
            <Sparkles className="w-6 h-6 text-sky-400" />
          </div>
          <h3 className="text-xl font-bold text-white mb-3">Agentic Capabilities</h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            Beyond answering questions, our AI acts as a digital worker. With integrated tool-calling, calendar booking, and support forwarding, the chatbot operates your business workflows autonomously.
          </p>
        </div>
      </div>
      
      <div className="text-center p-10 bg-gradient-to-br from-brand-900/40 to-indigo-900/40 border border-brand-500/30 rounded-3xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Globe className="w-32 h-32 text-brand-300" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-4 relative z-10">Ready to transform your customer experience?</h2>
        <p className="text-brand-200 mb-8 max-w-xl mx-auto relative z-10">
          Join hundreds of forward-thinking companies using our platform to automate their support and scale their sales.
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
