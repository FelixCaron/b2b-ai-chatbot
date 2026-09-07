import { useEffect, useState } from 'react';

/**
 * Stripe drops the user back on /payment-success or /payment-cancel. Both are
 * one-shot notices, so the URL is rewritten to '/' immediately — a refresh
 * should not replay a payment result.
 *
 * Reads the entry path once, on mount: by the time anything else runs, that
 * URL is gone.
 */
export function usePaymentToast(entryPath) {
  const [paymentToast, setPaymentToast] = useState(null); // 'success' | 'cancel' | null

  useEffect(() => {
    if (entryPath === '/payment-success') {
      setPaymentToast('success');
      // Clean up URL without hard reload
      window.history.replaceState({}, '', '/');
    } else if (entryPath === '/payment-cancel') {
      setPaymentToast('cancel');
      window.history.replaceState({}, '', '/');
      const t = setTimeout(() => setPaymentToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, []);

  return { paymentToast, setPaymentToast };
}

export default usePaymentToast;
