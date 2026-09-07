import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

// Supabase's specific "there is no account for this address" answer to a probe
// sign-in with shouldCreateUser:false. Matching on anything broader (any error
// at all) would read a network blip or a rate limit as "new user" and send the
// guest down the conversion path straight into a collision with a real account.
function isUnknownUserOtpError(error) {
  return (
    error?.code === 'otp_disabled' ||
    /signups not allowed for otp/i.test(error?.message || '')
  );
}

/**
 * Owns the Supabase session: bootstrapping one (anonymous if the visitor has
 * none), signing in by magic link, and signing out back into a fresh guest.
 *
 * `onBeforeConvertGuest(email)` is the hook's one seam: it runs while the
 * anonymous session is still live and can still prove it owns the guest tenant
 * — after the magic-link round trip that proof is gone for good. It returns the
 * claimed domain, or null, and only its return value reaches the message shown
 * to the user (see hooks/useGuestSiteClaim.js).
 */
export function useAuthSession({ onBeforeConvertGuest } = {}) {
  const [currentUser, setCurrentUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // Read through a ref so the effect below can stay mounted once, without
  // capturing a stale copy of a callback the caller rebuilds every render.
  const beforeConvertRef = useRef(onBeforeConvertGuest);
  beforeConvertRef.current = onBeforeConvertGuest;

  useEffect(() => {
    async function initSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setCurrentUser(session.user);
      } else {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) console.warn('[auth] anonymous sign-in failed:', error.message);
        setCurrentUser(data.user || null);
      }
      setAuthReady(true);
    }
    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email) => {
    setLoading(true);
    setAuthMessage('');
    try {
      if (currentUser?.is_anonymous) {
        // Probe first. A guest typing an address that already has an account
        // used to dead-end here: updateUser() failed with "email already
        // registered" and the workspace they had just built was orphaned.
        // shouldCreateUser:false means this either mails a sign-in link to an
        // existing account or tells us there is no account — it never creates
        // one, so it is safe to run before we know which case we are in.
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: false, emailRedirectTo: window.location.origin }
        });

        if (!otpError) {
          const claimedDomain = await beforeConvertRef.current?.(email);
          setAuthMessage(
            claimedDomain
              ? `That email already has an account — sign-in link sent. When you land, we'll offer to move ${claimedDomain} into it.`
              : 'That email already has an account — sign-in link sent. Check your email.'
          );
          return;
        }

        // Anything that isn't Supabase's specific "no such user" answer is a
        // real failure (network, rate limit, SMTP) and must surface as one.
        if (!isUnknownUserOtpError(otpError)) throw otpError;

        // No account for this address: convert the guest in place, as before.
        const { error } = await supabase.auth.updateUser({ email });
        if (error) throw error;
        setAuthMessage('Check your email to confirm and secure your workspace.');
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin }
        });
        if (error) throw error;
        setAuthMessage('Sign-in link sent. Check your email.');
      }
    } catch (e) {
      console.warn('[useAuthSession] login error:', e);
      setAuthMessage(e.message || 'Could not start sign-in.');
    } finally {
      setLoading(false);
    }
  };

  /** Sign out into a fresh anonymous session. The caller clears the workspace
   *  state that belonged to the account being left. */
  const logout = async () => {
    await supabase.auth.signOut();
    const { data } = await supabase.auth.signInAnonymously();
    setCurrentUser(data.user || null);
  };

  return {
    currentUser,
    setCurrentUser,
    authReady,
    loading,
    authMessage,
    sessionEmail: currentUser?.email || null,
    isGuest: Boolean(currentUser?.is_anonymous),
    login,
    logout
  };
}

export default useAuthSession;
