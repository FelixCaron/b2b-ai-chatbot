import React, { useState } from 'react';
import { Bot, ArrowRight, ShieldCheck, X } from 'lucide-react';

export default function LoginModal({ onLogin, onClose, isGuestConversion = false }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    
    setLoading(true);
    await onLogin(email.trim());
  };

  return (
    <div className="fixed inset-0 z-[9999999] bg-black/80 flex items-center justify-center p-4">
      <div className="relative glass-card p-10 rounded-3xl w-full max-w-md border border-white/10 shadow-2xl overflow-hidden">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white p-2 rounded-lg hover:bg-white/5 transition-colors z-10"
          >
            <X className="w-5 h-5" />
          </button>
        )}
        
        <div className="absolute inset-0 bg-gradient-to-br from-brand-900/20 to-indigo-900/20 pointer-events-none"></div>

        <div className="relative flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-400 flex items-center justify-center text-white shadow-xl shadow-brand-500/30 mb-6">
            <Bot className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-white text-center">
            {isGuestConversion ? "Félicitations, votre IA est prête !" : "Bienvenue sur votre Espace IA"}
          </h1>
          <p className="text-gray-400 text-sm mt-2 text-center">
            {isGuestConversion 
              ? "Entrez votre e-mail professionnel pour sauvegarder votre assistant et obtenir le code d'intégration."
              : "Entrez votre email professionnel pour vous connecter ou configurer votre assistant."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="relative space-y-6">
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-2">Adresse Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@entreprise.com"
              className="w-full bg-dark-800 border border-gray-700 text-white rounded-xl px-4 py-3 text-sm outline-none focus:border-brand-500 transition-colors"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading || !email}
            className="w-full bg-brand-600 hover:bg-brand-500 text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50"
          >
            {loading ? 'Sauvegarde en cours...' : (
              <>{isGuestConversion ? 'Enregistrer mon assistant' : 'Continuer'} <ArrowRight className="w-4 h-4" /></>
            )}
          </button>
        </form>

        <div className="relative mt-8 pt-6 border-t border-white/5 flex items-center justify-center gap-2 text-xs text-gray-500">
          <ShieldCheck className="w-4 h-4 text-emerald-500/70" /> {isGuestConversion ? "Création de compte sécurisée" : "Connexion sécurisée"}
        </div>
      </div>
    </div>
  );
}
