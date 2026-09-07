import React from 'react';

/** The transient notice after a Stripe redirect. Success has a whole page of
 *  its own (<PaymentSuccessPage />); only the cancel case is a toast. */
export default function PaymentToast({ kind }) {
  if (kind !== 'cancel') return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white border border-amber-300 text-amber-700 text-sm rounded-xl px-6 py-3 shadow-xl animate-in fade-in slide-in-from-bottom-4">
      ⚠️ Payment canceled. You can try again at any time.
    </div>
  );
}
