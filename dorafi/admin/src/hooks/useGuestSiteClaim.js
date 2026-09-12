import { useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import { clearPendingClaim, readPendingClaim, writePendingClaim } from '../lib/pending-claim';

/**
 * The guest-workspace transfer (ADR 057), end to end: filing a claim while the
 * anonymous session can still prove it owns the guest tenant, then — after the
 * magic-link round trip — asking the returning user before anything moves.
 *
 * `transferState` is null, or one of the states <WorkspaceTransfer /> renders:
 * { phase: 'prompt' | 'at_limit' | 'transferred' | 'duplicate', ... }
 */
export function useGuestSiteClaim({ authReady, currentUser, selectedTenant, sites, landOnSite, deleteSite }) {
  const [transferState, setTransferState] = useState(null);
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferError, setTransferError] = useState('');

  // Redeeming a claim must happen at most once per session however many times
  // the auth listener fires, and only for a session that actually *became*
  // signed-in here (a page load into an existing session has nothing to redeem).
  const redeemAttemptedRef = useRef(false);
  const sawUnauthenticatedRef = useRef(false);

  /**
   * File the claim that lets the workspace this guest just built follow them
   * into the account they are about to sign into. It has to happen *now*,
   * while the anonymous session is live and can prove it owns the guest tenant
   * — after the magic-link round trip that proof is gone for good.
   * Returns the claimed domain (for the confirmation copy), or null.
   */
  const createClaim = async (email) => {
    const guestTenantId = selectedTenant?.id;
    const guestSite = sites[0];
    if (!guestTenantId || !guestSite?.id) return null;

    const result = await api.sites.createClaim({
      guest_tenant_id: guestTenantId,
      site_id: guestSite.id,
      email
    });

    if (!result.ok || !result.data?.claim_id) {
      // Not fatal: the sign-in link is already on its way, so the user is
      // never blocked by this — they just don't get the transfer offer.
      console.warn('[claim] Could not record the guest workspace claim:', result.error);
      return null;
    }

    const domain = result.data.domain || guestSite.domain || '';
    writePendingClaim({ email: email.trim().toLowerCase(), domain, site_id: guestSite.id });
    return domain;
  };

  /**
   * Redeem the pending claim. This call *is* the transfer — claim_guest_site()
   * moves the site and everything hanging off it in one transaction — which is
   * why the confirmation happens before we get here, never after.
   */
  const redeemClaim = async () => {
    setTransferBusy(true);
    setTransferError('');
    try {
      const result = await api.sites.redeemClaim();
      const data = result.data;

      if (!result.ok || !data?.status) {
        console.warn('[claim] Redeem failed:', result.error);
        clearPendingClaim();
        setTransferState(null);
        return;
      }

      switch (data.status) {
        case 'transferred':
          clearPendingClaim();
          await landOnSite(data.tenant_id, data.site_id);
          setTransferState({ phase: 'transferred', domain: data.domain || '' });
          break;

        case 'at_limit':
          // The claim is deliberately left open by the RPC in this case, so the
          // user can upgrade or free a slot and we can call redeem again.
          setTransferState({
            phase: 'at_limit',
            domain: data.domain || '',
            plan: data.plan,
            limit: data.limit,
            siteCount: data.site_count
          });
          break;

        case 'duplicate_domain':
          // Nothing moved: the account's own copy is the one with its history.
          clearPendingClaim();
          if (selectedTenant?.id) await landOnSite(selectedTenant.id, data.existing_site_id);
          setTransferState({ phase: 'duplicate', domain: data.domain || '' });
          break;

        default:
          // not_found (by far the common case — every ordinary login lands
          // here), already_redeemed, expired, stale: nothing to say.
          clearPendingClaim();
          setTransferState(null);
      }
    } finally {
      setTransferBusy(false);
    }
  };

  /**
   * TRANSFER_AT_LIMIT → "replace an existing site". The confirm that names what
   * this destroys lives in <WorkspaceTransfer />; by the time we are called the
   * user has been through it.
   */
  const replaceSiteForTransfer = async (siteId) => {
    setTransferBusy(true);
    setTransferError('');
    const result = await deleteSite(siteId);
    if (!result?.success) {
      setTransferBusy(false);
      setTransferError(result?.error || 'Could not delete that website. Please try again.');
      return;
    }
    await redeemClaim();
  };

  const dismissTransfer = () => {
    // 'at_limit' keeps its note: the claim is still open server-side for
    // another 12h, so the offer can come back after an upgrade.
    if (transferState?.phase !== 'at_limit') clearPendingClaim();
    setTransferError('');
    setTransferState(null);
  };

  // The LINK_RETURN moment: the session has just become a real (non-anonymous)
  // one. Ask before moving anything — the transfer itself is irreversible from
  // the browser's side.
  useEffect(() => {
    if (!authReady) return;

    if (!currentUser || currentUser.is_anonymous) {
      // Seeing a guest/signed-out session is what makes a *later* signed-in one
      // a genuine sign-in rather than a page load into an existing session.
      sawUnauthenticatedRef.current = true;
      redeemAttemptedRef.current = false;
      return;
    }

    if (redeemAttemptedRef.current) return;

    const pending = readPendingClaim();
    const pendingMatchesSession =
      pending?.email && currentUser.email &&
      pending.email.toLowerCase() === currentUser.email.toLowerCase();

    if (pendingMatchesSession) {
      redeemAttemptedRef.current = true;
      setTransferState({ phase: 'prompt', domain: pending.domain || '' });
      return;
    }

    // A note left for somebody else's address is stale the moment this session
    // proves it belongs to a different one.
    if (pending) clearPendingClaim();

    // No local note: we cannot name what would move, so there is nothing to
    // confirm. Still worth asking the server on a real sign-in — the note is
    // lost if the link is opened in another browser — but never on a plain
    // page load into a session that was already signed in.
    if (!sawUnauthenticatedRef.current) return;
    redeemAttemptedRef.current = true;
    redeemClaim();
  }, [authReady, currentUser?.id, currentUser?.is_anonymous, currentUser?.email]);

  // The two notices are informational — they shouldn't need dismissing.
  useEffect(() => {
    if (transferState?.phase !== 'transferred' && transferState?.phase !== 'duplicate') return;
    const t = setTimeout(() => setTransferState(null), 8000);
    return () => clearTimeout(t);
  }, [transferState?.phase]);

  return {
    transferState,
    transferBusy,
    transferError,
    createClaim,
    redeemClaim,
    replaceSiteForTransfer,
    dismissTransfer,
    setTransferState
  };
}

export default useGuestSiteClaim;
