import React, { useEffect, useRef, useState } from 'react';
import { authenticatedHeaders, supabase, supabaseConfigurationError } from './lib/supabase';
import Header from './components/Header';
import Dashboard from './features/dashboard/Dashboard';
import LeadsTable from './components/LeadsTable';
import LoginModal from './components/LoginModal';
import Pricing from './components/Pricing';
import PaymentSuccessPage from './components/PaymentSuccessPage';
import AboutPage from './components/AboutPage';
import { PrivacyPolicy, TermsOfService } from './components/LegalPages';
import OsteopathyLanding from './components/OsteopathyLanding';
import WorkspaceTransfer from './components/WorkspaceTransfer';
import { Users, Menu, X } from 'lucide-react';

// ---------------------------------------------------------------------------
// Views ↔ URLs. `currentView` stays the single render switch below; this map
// is only the translation layer that gives each view a real address, so Back
// moves between views instead of leaving the application and a refresh lands
// where the user was (ADR 057). Deliberately not a router: the whole change
// is this map, navigate(), and one popstate listener.
// ---------------------------------------------------------------------------
const VIEW_PATHS = {
  dashboard: '/',
  leads: '/leads',
  pricing: '/pricing',
  about: '/about',
  privacy: '/privacy',
  terms: '/terms',
  'payment-success': '/payment-success',
  osteopathes: '/solutions/osteopathes'
};

function viewForPath(pathname) {
  // Stripe's cancel URL has no view of its own — it drops the user back on the
  // pricing table (and the URL is rewritten to '/' by the toast effect below).
  if (pathname === '/payment-cancel') return 'pricing';
  const normalized = pathname !== '/' ? pathname.replace(/\/+$/, '') : pathname;
  return Object.keys(VIEW_PATHS).find((view) => VIEW_PATHS[view] === normalized) || 'dashboard';
}

// ---------------------------------------------------------------------------
// Pending guest-workspace claim (ADR 057). The claim itself lives server-side
// in `guest_site_claims` — this is only a local note that we filed one, so the
// returning session knows to *ask* before anything moves and can name the
// domain in the question. It is never trusted as proof of anything: redeeming
// takes no ids at all, only the verified email on the caller's own token.
// ---------------------------------------------------------------------------
const PENDING_CLAIM_KEY = 'repondo.pending_site_claim';

function readPendingClaim() {
  try {
    const raw = window.localStorage.getItem(PENDING_CLAIM_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

function writePendingClaim(claim) {
  try {
    window.localStorage.setItem(PENDING_CLAIM_KEY, JSON.stringify(claim));
  } catch (err) {
    // Private mode / disabled storage: we simply won't be able to pre-announce
    // the domain on return. The claim on the server is unaffected.
  }
}

function clearPendingClaim() {
  try {
    window.localStorage.removeItem(PENDING_CLAIM_KEY);
  } catch (err) {
    /* nothing to clean up */
  }
}

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

// Dashboard selects sites[0] when it has no selection of its own, so "land the
// user on this site" is expressed by ordering the list around it.
function orderSitesForFocus(rows, focusSiteId) {
  if (!focusSiteId) return rows;
  const focused = rows.find((site) => site.id === focusSiteId);
  return focused ? [focused, ...rows.filter((site) => site.id !== focusSiteId)] : rows;
}

export default function App() {
  if (supabaseConfigurationError) {
    return (
      <main className="min-h-screen bg-dark-900 flex items-center justify-center p-6 text-slate-100">
        <div className="max-w-lg rounded-xl border border-red-400/40 bg-red-950/30 p-6">
          <h1 className="text-lg font-semibold">Configuration requise</h1>
          <p className="mt-2 text-sm text-slate-300">{supabaseConfigurationError}</p>
        </div>
      </main>
    );
  }
  const [currentUser, setCurrentUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [sites, setSites] = useState([]);
  const [leads, setLeads] = useState([]);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [paymentToast, setPaymentToast] = useState(null); // 'success' | 'cancel' | null

  // Guest-workspace transfer (ADR 057): null, or one of the states rendered by
  // <WorkspaceTransfer /> — { phase: 'prompt' | 'at_limit' | 'transferred' | 'duplicate', ... }
  const [transferState, setTransferState] = useState(null);
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferError, setTransferError] = useState('');

  // Resolve the first view from the address bar (Stripe redirects included),
  // so a deep link — /solutions/osteopathes, /pricing, a refreshed /leads —
  // renders that view rather than always booting into the dashboard.
  const path = window.location.pathname;
  const [currentView, setCurrentView] = useState(() => viewForPath(path));

  // Redeeming a claim must happen at most once per session however many times
  // the auth listener fires, and only for a session that actually *became*
  // signed-in here (a page load into an existing session has nothing to redeem).
  const redeemAttemptedRef = useRef(false);
  const sawUnauthenticatedRef = useRef(false);
  const focusSiteIdRef = useRef(null);

  const sessionEmail = currentUser?.email || null;
  const isGuest = Boolean(currentUser?.is_anonymous);

  // The one place a view change happens: keep `currentView` (the render switch)
  // and the URL in step.
  const navigate = (view) => {
    const nextView = VIEW_PATHS[view] ? view : 'dashboard';
    setCurrentView(nextView);
    const target = VIEW_PATHS[nextView];
    if (window.location.pathname !== target) {
      window.history.pushState({ view: nextView }, '', target);
    }
  };

  // Back/forward buttons: the URL is already where the browser wants it, so
  // only the render switch has to catch up (no pushState here — that would
  // fight the history entry we are moving to).
  useEffect(() => {
    const handlePopState = () => setCurrentView(viewForPath(window.location.pathname));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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

    // Listen for B2B Copilot Tool Calls
    const handleCopilotTool = (e) => {
      const { name, args } = e.detail;
      if (name === 'navigate_to' && args?.page) {
        navigate(args.page.toLowerCase());
      }
    };
    window.addEventListener('b2b_tool_call', handleCopilotTool);
    return () => {
      subscription.unsubscribe();
      window.removeEventListener('b2b_tool_call', handleCopilotTool);
    };
  }, []);

  // File the claim that lets the workspace this guest just built follow them
  // into the account they are about to sign into. It has to happen *now*,
  // while the anonymous session is live and can prove it owns the guest tenant
  // — after the magic-link round trip that proof is gone for good.
  // Returns the claimed domain (for the confirmation copy), or null.
  const createGuestSiteClaim = async (email) => {
    const guestTenantId = selectedTenant?.id;
    const guestSite = sites[0];
    if (!guestTenantId || !guestSite?.id) return null;

    try {
      const res = await fetch(`${window.location.origin}/api/sites/claim`, {
        method: 'POST',
        headers: await authenticatedHeaders(),
        body: JSON.stringify({
          action: 'create',
          guest_tenant_id: guestTenantId,
          site_id: guestSite.id,
          email
        })
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.claim_id) {
        // Not fatal: the sign-in link is already on its way, so the user is
        // never blocked by this — they just don't get the transfer offer.
        console.warn('[claim] Could not record the guest workspace claim:', data?.error || res.status);
        return null;
      }

      const domain = data.domain || guestSite.domain || '';
      writePendingClaim({ email: email.trim().toLowerCase(), domain, site_id: guestSite.id });
      return domain;
    } catch (err) {
      console.warn('[claim] Could not record the guest workspace claim:', err);
      return null;
    }
  };

  const handleLogin = async (email) => {
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
          const claimedDomain = await createGuestSiteClaim(email);
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
      console.warn('[handleLogin] error:', e);
      setAuthMessage(e.message || 'Could not start sign-in.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSelectedTenant(null);
    setTenants([]);
    setSites([]);
    setLeads([]);
    const { data } = await supabase.auth.signInAnonymously();
    setCurrentUser(data.user || null);
  };

  // Pull the account's data back in around a site that just arrived (or that
  // already lived here), and put the user in front of it.
  const landOnSite = async (tenantId, siteId) => {
    focusSiteIdRef.current = siteId || null;

    const { data: tenantRow } = await supabase.from('tenants').select('*').eq('id', tenantId).maybeSingle();
    if (tenantRow) {
      setTenants((prev) => (prev.some((t) => t.id === tenantRow.id) ? prev : [...prev, tenantRow]));
      setSelectedTenant(tenantRow);
    }

    const { data: sitesData } = await supabase.from('sites').select('*').eq('tenant_id', tenantId);
    setSites(orderSitesForFocus(sitesData || [], siteId));

    const { data: leadsData } = await supabase
      .from('leads')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    setLeads(leadsData || []);

    navigate('dashboard');
  };

  // Redeem the pending claim. This call *is* the transfer — claim_guest_site()
  // moves the site and everything hanging off it in one transaction — which is
  // why the confirmation happens before we get here, never after.
  const redeemGuestSiteClaim = async () => {
    setTransferBusy(true);
    setTransferError('');
    try {
      const res = await fetch(`${window.location.origin}/api/sites/claim`, {
        method: 'POST',
        headers: await authenticatedHeaders(),
        body: JSON.stringify({ action: 'redeem' })
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.status) {
        console.warn('[claim] Redeem failed:', data?.error || res.status);
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
    } catch (err) {
      console.warn('[claim] Redeem error:', err);
      setTransferState(null);
    } finally {
      setTransferBusy(false);
    }
  };

  // TRANSFER_AT_LIMIT → "replace an existing site". The confirm that names what
  // this destroys lives in <WorkspaceTransfer />; by the time we are called the
  // user has been through it.
  const handleReplaceSiteForTransfer = async (siteId) => {
    setTransferBusy(true);
    setTransferError('');
    const result = await handleDeleteSite(siteId);
    if (!result?.success) {
      setTransferBusy(false);
      setTransferError(result?.error || 'Could not delete that website. Please try again.');
      return;
    }
    await redeemGuestSiteClaim();
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
    redeemGuestSiteClaim();
  }, [authReady, currentUser?.id, currentUser?.is_anonymous, currentUser?.email]);

  // The two notices are informational — they shouldn't need dismissing.
  useEffect(() => {
    if (transferState?.phase !== 'transferred' && transferState?.phase !== 'duplicate') return;
    const t = setTimeout(() => setTransferState(null), 8000);
    return () => clearTimeout(t);
  }, [transferState?.phase]);

  // Show toast on payment redirect
  useEffect(() => {
    if (path === '/payment-success') {
      setPaymentToast('success');
      // Clean up URL without hard reload
      window.history.replaceState({}, '', '/');
    } else if (path === '/payment-cancel') {
      setPaymentToast('cancel');
      window.history.replaceState({}, '', '/');
      const t = setTimeout(() => setPaymentToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    if (!currentUser || !authReady) return;
    async function loadOwnedTenants() {
      const { data } = await supabase.from('tenants').select('*').eq('owner_user_id', currentUser.id);
      let ownedTenants = data || [];

      // A tenant created before its owner provided an email is named
      // `Guest_<timestamp>` (see handleAddSite below) and nothing ever
      // renamed it once they converted — a real, registered account could
      // sit under a stale "Guest_..." name forever, which is confusing in
      // any tenant list AND actively dangerous: the cleanup cron used to
      // decide what to delete by matching this same stale name pattern, so
      // a converted user's real data could get swept up by it. Fix at the
      // source: once we know the account is real (not anonymous, has a
      // confirmed email), bring the name in line with reality.
      if (!currentUser.is_anonymous && currentUser.email) {
        const staleGuestTenants = ownedTenants.filter(
          (tenant) => tenant.name?.startsWith('Guest_') && tenant.name !== currentUser.email
        );
        if (staleGuestTenants.length > 0) {
          await Promise.all(
            staleGuestTenants.map((tenant) =>
              supabase.from('tenants').update({ name: currentUser.email }).eq('id', tenant.id)
            )
          );
          ownedTenants = ownedTenants.map((tenant) =>
            staleGuestTenants.some((stale) => stale.id === tenant.id)
              ? { ...tenant, name: currentUser.email }
              : tenant
          );
        }
      }

      setTenants(ownedTenants);
      setSelectedTenant((current) => ownedTenants.find((tenant) => tenant.id === current?.id) || ownedTenants[0] || null);
    }
    loadOwnedTenants();
  }, [currentUser?.id, currentUser?.is_anonymous, currentUser?.email, authReady]);

  // Fetch tenant-specific resources whenever selectedTenant changes
  useEffect(() => {
    if (!selectedTenant) return;

    async function loadTenantData() {
      const tId = selectedTenant.id;
      // Refresh tenant to pick up plan changes from Stripe webhook
      const { data: freshTenant } = await supabase.from('tenants').select('*').eq('id', tId).single();
      if (freshTenant) setSelectedTenant(freshTenant);

      const { data: sitesData } = await supabase.from('sites').select('*').eq('tenant_id', tId);
      // Same ordering as landOnSite(), so a workspace transfer that also
      // switches tenant lands on the moved site whichever of the two refreshes
      // finishes last.
      setSites(orderSitesForFocus(sitesData || [], focusSiteIdRef.current));

      const { data: leadsData } = await supabase.from('leads').select('*').eq('tenant_id', tId).order('created_at', { ascending: false });
      setLeads(leadsData || []);

      const { data: usageData } = await supabase.from('usage').select('*').eq('tenant_id', tId).maybeSingle();
      setUsage(usageData || { messages_count: 0, leads_count: 0 });
    }

    loadTenantData();
  }, [selectedTenant?.id]);

  // Handler: Add new Site
  const handleAddSite = async (domain, primaryColor = '#6366f1') => {
    let user = currentUser;
    if (!user) {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session?.user) {
        user = sessionData.session.user;
        setCurrentUser(user);
      } else {
        const { data: anonData, error: anonErr } = await supabase.auth.signInAnonymously();
        if (anonErr || !anonData?.user) {
          console.error('[handleAddSite] Anonymous sign-in failed:', anonErr);
          throw new Error(anonErr?.message || 'Session not initialized. Enable "Anonymous Sign-in" in your Supabase Auth settings, or sign in.');
        }
        user = anonData.user;
        setCurrentUser(user);
      }
    }

    let tId = selectedTenant?.id;
    if (!tId) {
      const { data: existingTenants } = await supabase
        .from('tenants')
        .select('*')
        .eq('owner_user_id', user.id);

      if (existingTenants && existingTenants.length > 0) {
        tId = existingTenants[0].id;
        setSelectedTenant(existingTenants[0]);
        setTenants(existingTenants);
      } else {
        const { data: guestTenant, error: tErr } = await supabase
          .from('tenants')
          .insert({ name: user.email || `Guest_${Date.now()}`, owner_user_id: user.id })
          .select()
          .single();

        if (tErr || !guestTenant) {
          console.error('[handleAddSite] Tenant creation failed:', tErr);
          throw new Error(`Failed to create workspace: ${tErr?.message || 'Database error'}`);
        }
        tId = guestTenant.id;
        setTenants([guestTenant]);
        setSelectedTenant(guestTenant);
      }
    }

    // 1. Attempt insert
    const { data: newSite, error: siteInsertErr } = await supabase
      .from('sites')
      .insert({
        tenant_id: tId,
        domain: domain,
        theme_primary_color: primaryColor,
        enable_lead_capture: false
      })
      .select()
      .single();

    if (newSite) {
      setSites((prev) => [newSite, ...prev.filter((s) => s.id !== newSite.id)]);
      return newSite;
    }

    // 2. Translate the two constraints the database now enforces (see
    //    20260905030000_site_limits_and_guest_claims.sql) into something a
    //    user can act on.
    //
    //    There used to be a "fallback" here that looked the domain up across
    //    *all* tenants and, if it found one, re-pointed that row's tenant_id at
    //    the current tenant. That is a cross-tenant takeover primitive — it only
    //    failed to be exploitable because RLS happened to block the update — and
    //    it was dead code anyway: nothing made domains collide globally. A
    //    failed insert now fails, full stop.
    const insertMessage = siteInsertErr?.message || '';
    console.warn('[handleAddSite] Insert site failed:', insertMessage);

    if (insertMessage.includes('site_limit_reached')) {
      throw new Error(
        'Your plan has no room for another website. Upgrade your plan, or remove a website you no longer use.'
      );
    }

    if (siteInsertErr?.code === '23505' || insertMessage.includes('sites_tenant_domain_uq')) {
      throw new Error(`${domain} is already in this workspace. Open it from your website list instead of adding it again.`);
    }

    throw new Error(insertMessage || 'Failed to save the domain to the database.');
  };

  // Handler: Update site settings
  const handleUpdateSiteSettings = async (siteId, updates) => {
    const { data: updated } = await supabase.from('sites').update(updates).eq('id', siteId).select().single();
    if (updated) {
      setSites((prev) => prev.map((s) => (s.id === siteId ? updated : s)));
    }
  };

  // Handler: Delete unselected document URLs
  const handleDeleteDocumentUrls = async (siteId, urlsToDelete) => {
    if (!urlsToDelete || urlsToDelete.length === 0) return;
    await supabase.from('documents').delete().eq('site_id', siteId).in('url', urlsToDelete);
  };

  // Handler: Delete entire Site and its associated documents/summaries.
  // This calls the atomic server-side RPC (delete_site_cascade) via the API
  // route so the deletion either fully succeeds or fully fails — never a
  // partial deletion. Only on a *confirmed* success do we touch local/UI
  // state; on failure we surface the real error instead of silently pretending
  // the site is gone (which used to leave "ghost" sites: removed from the UI
  // but still present, along with their data, in the database).
  const handleDeleteSite = async (siteId) => {
    if (!siteId || !selectedTenant?.id) {
      return { success: false, error: 'Missing site or workspace context.' };
    }
    try {
      const res = await fetch(`${window.location.origin}/api/crawler/delete-site`, {
        method: 'POST',
        headers: await authenticatedHeaders(),
        body: JSON.stringify({ site_id: siteId, tenant_id: selectedTenant.id })
      });

      let data = null;
      try {
        data = await res.json();
      } catch (parseErr) {
        // response had no/invalid JSON body — fall through to error handling below
      }

      if (res.ok && data?.success) {
        setSites((prev) => prev.filter((s) => s.id !== siteId));
        return { success: true };
      }

      const errorMessage = data?.error || `Deletion failed (HTTP ${res.status}). Please try again.`;
      console.error('[handleDeleteSite] Server refused/failed deletion:', errorMessage);
      return { success: false, error: errorMessage };
    } catch (err) {
      console.error('[handleDeleteSite] Network/exception error:', err);
      return { success: false, error: err.message || 'Network error while deleting the site. Please check your connection and try again.' };
    }
  };

  // Handler: Trigger Scan Job
  const handleTriggerScan = async (siteId, url, optionalTenantId = null) => {
    const tId = optionalTenantId || selectedTenant?.id;
    if (!tId) return { success: false, error: 'No tenant selected' };
    try {
      const res = await fetch(`${window.location.origin}/api/crawler/scan`, {
        method: 'POST',
        headers: await authenticatedHeaders(),
        body: JSON.stringify({ site_id: siteId, tenant_id: tId, url: url })
      });
      const data = await res.json();
      return { success: res.ok, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  if (loading || !authReady) {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center text-brand-400 text-sm font-medium animate-pulse">
        Loading Client Workspace...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-900 pb-16">
      {sessionEmail && (
        <Header
          tenants={tenants}
          selectedTenant={selectedTenant}
          setSelectedTenant={setSelectedTenant}
          onLogout={handleLogout}
          currentView={currentView}
          onSelectView={navigate}
          onShowPricing={() => navigate('pricing')}
          leadsCount={leads.length}
        />
      )}

      {showLoginModal && (
        <LoginModal 
          onLogin={handleLogin} 
          onClose={!isGuest ? () => setShowLoginModal(false) : undefined}
          isGuestConversion={isGuest}
          message={authMessage}
        />
      )}

      {/* Guest workspace waiting to move into the account just signed into */}
      <WorkspaceTransfer
        state={transferState}
        sites={sites}
        busy={transferBusy}
        error={transferError}
        onConfirm={redeemGuestSiteClaim}
        onDismiss={() => {
          // 'at_limit' keeps its note: the claim is still open server-side for
          // another 12h, so the offer can come back after an upgrade.
          if (transferState?.phase !== 'at_limit') clearPendingClaim();
          setTransferError('');
          setTransferState(null);
        }}
        onUpgrade={() => {
          setTransferState(null);
          navigate('pricing');
        }}
        onReplaceSite={handleReplaceSiteForTransfer}
      />

      {/* For Guest, we add a simple brand header with navigation tabs.
          It's skipped on marketing/landing screens (the niche pages, and
          the root onboarding hero before a site exists) - the app-shell
          nav (Dashboard/Leads/Plans/Sign In) doesn't belong there, only
          once there's an actual workspace to navigate. */}
      {!sessionEmail && !showLoginModal && currentView !== 'osteopathes' &&
        !(currentView === 'dashboard' && sites.length === 0) && (
        <header className="glass-card sticky top-0 z-50 px-4 sm:px-8 py-3 sm:py-4 mb-6 sm:mb-8">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <div
                onClick={() => { navigate('dashboard'); setMobileMenuOpen(false); }}
                className="flex items-center gap-3 cursor-pointer"
              >
                <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-400 shadow-lg flex items-center justify-center">
                  <span className="text-white font-extrabold text-base sm:text-lg leading-none select-none">R</span>
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-dark-900" />
                </div>
                <h1 className="text-base sm:text-lg font-bold text-white tracking-tight lowercase">repondo</h1>
              </div>

              {/* Desktop nav */}
              <nav className="hidden sm:flex items-center gap-1 bg-dark-900/80 p-1 rounded-xl border border-white/5">
                <button
                  onClick={() => navigate('dashboard')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    currentView === 'dashboard' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Dashboard
                </button>
                <button
                  onClick={() => navigate('leads')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    currentView === 'leads' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Leads ({leads.length})
                </button>
                <button
                  onClick={() => navigate('pricing')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    currentView === 'pricing' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Plans
                </button>
                <button
                  onClick={() => navigate('about')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    currentView === 'about' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  About
                </button>
              </nav>
            </div>

            {/* Desktop Sign In */}
            <button
              onClick={() => setShowLoginModal(true)}
              className="hidden sm:inline-flex text-xs sm:text-sm font-medium bg-white/10 hover:bg-white/20 text-white px-3.5 py-1.5 rounded-lg transition-colors"
            >
              Sign In
            </button>

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="sm:hidden w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-gray-300 transition-colors"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>

          {/* Mobile dropdown */}
          {mobileMenuOpen && (
            <div className="sm:hidden max-w-7xl mx-auto mt-3 pt-3 border-t border-white/10 flex flex-col gap-1 animate-in fade-in slide-in-from-top-2 duration-150">
              <button
                onClick={() => { navigate('dashboard'); setMobileMenuOpen(false); }}
                className={`text-left px-3.5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  currentView === 'dashboard' ? 'bg-brand-600 text-white' : 'text-gray-300 hover:bg-white/5'
                }`}
              >
                Dashboard
              </button>
              <button
                onClick={() => { navigate('leads'); setMobileMenuOpen(false); }}
                className={`text-left px-3.5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  currentView === 'leads' ? 'bg-brand-600 text-white' : 'text-gray-300 hover:bg-white/5'
                }`}
              >
                Leads ({leads.length})
              </button>
              <button
                onClick={() => { navigate('pricing'); setMobileMenuOpen(false); }}
                className={`text-left px-3.5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  currentView === 'pricing' ? 'bg-brand-600 text-white' : 'text-gray-300 hover:bg-white/5'
                }`}
              >
                Plans
              </button>
              <button
                onClick={() => { navigate('about'); setMobileMenuOpen(false); }}
                className={`text-left px-3.5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  currentView === 'about' ? 'bg-brand-600 text-white' : 'text-gray-300 hover:bg-white/5'
                }`}
              >
                About
              </button>
              <button
                onClick={() => { setShowLoginModal(true); setMobileMenuOpen(false); }}
                className="text-left px-3.5 py-2.5 rounded-lg text-sm font-semibold text-white bg-white/10 hover:bg-white/20 mt-1 transition-colors"
              >
                Sign In
              </button>
            </div>
          )}
        </header>
      )}

      {/* Payment cancel toast */}
      {paymentToast === 'cancel' && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-dark-800 border border-yellow-500/30 text-yellow-400 text-sm rounded-xl px-6 py-3 shadow-xl animate-in fade-in slide-in-from-bottom-4">
          ⚠️ Payment canceled. You can try again at any time.
        </div>
      )}

      {currentView === 'payment-success' ? (
        <PaymentSuccessPage onGoToDashboard={() => { navigate('dashboard'); setPaymentToast(null); }} />
      ) : currentView === 'pricing' ? (
        <Pricing
          onSelectPlan={() => navigate('dashboard')}
          tenantId={selectedTenant?.id}
          currentPlan={selectedTenant?.plan || 'free'}
          onNavigate={navigate}
        />
      ) : currentView === 'about' ? (
        <AboutPage />
      ) : currentView === 'osteopathes' ? (
        <OsteopathyLanding onNavigate={navigate} />
      ) : currentView === 'privacy' ? (
        <PrivacyPolicy />
      ) : currentView === 'terms' ? (
        <TermsOfService />
      ) : currentView === 'leads' ? (
        <main className="max-w-7xl mx-auto px-4 sm:px-8 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 border border-indigo-500/30">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Captured Leads & Contacts</h2>
                <p className="text-xs text-gray-400">Prospects and inquiries collected automatically by your AI assistants</p>
              </div>
            </div>
            <button
              onClick={() => navigate('dashboard')}
              className="text-xs text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-white/10"
            >
              ← Back to Dashboard
            </button>
          </div>
          <LeadsTable leads={leads} />
        </main>
      ) : (
        <main className="max-w-7xl mx-auto px-4 sm:px-8 space-y-8 sm:space-y-12">
          <section>
            <Dashboard
              selectedTenant={selectedTenant}
              sites={sites}
              onAddSite={handleAddSite}
              onUpdateSiteSettings={handleUpdateSiteSettings}
              onDeleteDocumentUrls={handleDeleteDocumentUrls}
              onTriggerScan={handleTriggerScan}
              onDeleteSite={handleDeleteSite}
              isGuest={isGuest}
              onRequireLogin={() => setShowLoginModal(true)}
              onViewLeads={() => navigate('leads')}
              onShowPricing={() => navigate('pricing')}
              leadsCount={leads.length}
            />
          </section>

          {leads.length > 0 && (
            <section className="border-t border-white/5 pt-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 border border-indigo-500/30">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Recent Captured Leads</h2>
                    <p className="text-xs text-gray-400">{leads.length} prospect{leads.length > 1 ? 's' : ''} captured</p>
                  </div>
                </div>
                <button
                  onClick={() => navigate('leads')}
                  className="text-xs text-brand-400 hover:text-brand-300 font-semibold"
                >
                  View All Leads →
                </button>
              </div>
              <LeadsTable leads={leads} />
            </section>
          )}
        </main>
      )}

      <footer className="max-w-7xl mx-auto px-4 sm:px-8 py-8 mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-gray-500 border-t border-white/5">
        <button onClick={() => navigate('about')} className="hover:text-gray-300 transition-colors">
          About
        </button>
        <button onClick={() => navigate('privacy')} className="hover:text-gray-300 transition-colors">
          Privacy Policy
        </button>
        <button onClick={() => navigate('terms')} className="hover:text-gray-300 transition-colors">
          Terms of Service
        </button>
        <span>&copy; {new Date().getFullYear()} Repondo</span>
      </footer>
    </div>
  );
}
