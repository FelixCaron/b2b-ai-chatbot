// ---------------------------------------------------------------------------
// Pending guest-workspace claim (ADR 057). The claim itself lives server-side
// in `guest_site_claims` — this is only a local note that we filed one, so the
// returning session knows to *ask* before anything moves and can name the
// domain in the question. It is never trusted as proof of anything: redeeming
// takes no ids at all, only the verified email on the caller's own token.
// ---------------------------------------------------------------------------

const PENDING_CLAIM_KEY = 'dorafi.pending_site_claim';

export function readPendingClaim() {
  try {
    const raw = window.localStorage.getItem(PENDING_CLAIM_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

export function writePendingClaim(claim) {
  try {
    window.localStorage.setItem(PENDING_CLAIM_KEY, JSON.stringify(claim));
  } catch (err) {
    // Private mode / disabled storage: we simply won't be able to pre-announce
    // the domain on return. The claim on the server is unaffected.
  }
}

export function clearPendingClaim() {
  try {
    window.localStorage.removeItem(PENDING_CLAIM_KEY);
  } catch (err) {
    /* nothing to clean up */
  }
}
