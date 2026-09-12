import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;
const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
const systemEmail = 'noreply@dorafi.logafi.com'; // Requires this domain to be verified in Resend before sending will actually deliver

const resend = resendApiKey ? new Resend(resendApiKey) : null;

/**
 * One send, one honest answer: `{ delivered, error }`.
 *
 * The Resend SDK does not throw on a rejected send. Every failure that
 * actually happens in production — a bad or missing API key (401), a sending
 * domain that was never verified (403), a malformed recipient (422), even a
 * network error — comes back as a *resolved* promise carrying
 * `{ data: null, error: { name, statusCode, message } }`. Every function here
 * used to `await` that inside a try/catch and treat "it didn't throw" as
 * "it was sent", which made the catch block dead code for exactly the cases
 * it was written for: we reported success for mail that never left, logged
 * nothing, and the assistant promised visitors a reply that was never coming.
 *
 * So: read the error, return it, and let the caller act on it.
 */
async function deliver(payload, kind) {
  if (!resend) {
    // Not a tenant's problem and not a per-message failure: the platform is
    // missing its own credentials. Loud, and distinct from a rejected send.
    const message = 'RESEND_API_KEY is not configured — no transactional email can be sent.';
    console.error(`[email] ${kind}: ${message}`);
    return { delivered: false, error: message };
  }

  const { data, error } = await resend.emails.send(payload);

  if (error) {
    // error.name/statusCode are Resend's own vocabulary ('validation_error',
    // 'not_found', 403 for an unverified domain, ...). Kept verbatim: this
    // string is what tells us which of them we are looking at.
    const message = [error.name, error.statusCode, error.message].filter(Boolean).join(' / ');
    console.error(`[email] ${kind} was NOT delivered:`, message);
    return { delivered: false, error: message };
  }

  return { delivered: true, error: null, id: data?.id || null };
}

// One alert per failure kind per isolate per window. An outage means every
// message fails, and an alert per failed message would bury the signal in
// its own noise (and burn the same quota that is already failing). Edge
// isolates are short-lived, so this is best-effort de-duplication rather
// than a guarantee — which is the right trade for an alert path.
const ALERT_WINDOW_MS = 15 * 60 * 1000;
const recentAlerts = new Map();

function shouldAlert(key) {
  const now = Date.now();
  const last = recentAlerts.get(key);
  if (last && now - last < ALERT_WINDOW_MS) return false;
  recentAlerts.set(key, now);
  if (recentAlerts.size > 500) recentAlerts.clear();
  return true;
}

/**
 * Tell *us* that something on our side broke.
 *
 * A tenant is a customer of this platform, not its operator: an email of ours
 * that fails to send is our incident to notice and fix, and asking them to go
 * check a Resend dashboard they have no account on is not a fix. This is the
 * path that puts a platform-side failure in front of the people who can
 * actually do something about it.
 *
 * Deliberately never recursive: if the alert itself can't be delivered, it is
 * logged and dropped. An alert about a failing alert would be the same
 * failure, twice.
 */
export async function alertPlatform(subject, details, dedupeKey = null) {
  if (dedupeKey && !shouldAlert(dedupeKey)) return { delivered: false, error: 'suppressed (duplicate)' };

  const result = await deliver({
    from: `Dorafi <${systemEmail}>`,
    to: adminEmail,
    subject: `🚨 [Dorafi] ${subject}`,
    html: `
      <h2>${subject}</h2>
      <pre style="white-space:pre-wrap">${JSON.stringify(details || {}, null, 2)}</pre>
    `
  }, 'platform alert');

  if (!result.delivered) {
    console.error('[email] platform alert could not be delivered either:', result.error, subject, details);
  }
  return result;
}

export async function sendBugAlertEmail(error, context) {
  const message = error?.message || String(error);
  return alertPlatform(
    'Unhandled error',
    {
      error: message,
      stack: error?.stack || 'No stack trace',
      context: context || {}
    },
    // An error in a hot path fires on every request; one alert per distinct
    // error per window is the signal, the rest is the same news repeated.
    `bug:${message}`
  );
}

/**
 * Forwards a visitor's support request to the tenant's configured support
 * inbox. Returns `{ delivered, error }` — callers must not tell the visitor
 * (or the model) it was sent without checking `delivered`, and the caller
 * persists `error` so a failed send is diagnosable after the fact instead of
 * living only in an Edge log nobody reads.
 *
 * A failure here also raises a platform alert: the tenant did nothing wrong,
 * and the visitor is waiting on a reply that isn't coming.
 */
export async function sendSupportTicketEmail(ticket, siteData) {
  const recipient = siteData?.support_email;
  if (!recipient) {
    return { delivered: false, error: 'No support_email configured for this site.' };
  }

  const result = await deliver({
    from: `Dorafi <${systemEmail}>`,
    replyTo: ticket?.email || undefined,
    to: recipient,
    subject: `🎫 New support request via your assistant (${siteData?.domain || 'your site'})`,
    html: `
      <h2>A visitor asked your assistant for help</h2>
      <p><strong>Site:</strong> ${siteData?.domain || 'N/A'}</p>
      <p><strong>Name:</strong> ${ticket?.name || 'Not provided'}</p>
      <p><strong>Email:</strong> ${ticket?.email || 'Not provided'}</p>
      <p><strong>Message:</strong></p>
      <p>${ticket?.message || 'Not provided'}</p>
    `
  }, 'support ticket');

  if (!result.delivered) {
    await alertPlatform(
      'Support request could not be emailed to a customer',
      {
        site: siteData?.domain || null,
        site_id: siteData?.id || null,
        recipient,
        reason: result.error,
        note: 'The ticket itself is saved in support_tickets — the customer can still see and answer it in their dashboard.'
      },
      `support-ticket:${result.error}`
    );
  }

  return result;
}

export async function sendLeadEmail(leadData, siteData) {
  const recipient = siteData?.support_email || adminEmail;

  const result = await deliver({
    from: `Dorafi <${systemEmail}>`,
    to: recipient,
    subject: `🚀 New lead captured on ${siteData?.domain || 'your site'}!`,
    html: `
      <h2>A new lead was captured!</h2>
      <p><strong>Site:</strong> ${siteData?.domain || 'N/A'}</p>
      <p><strong>Name / Company:</strong> ${leadData?.name || 'Not specified'}</p>
      <p><strong>Email:</strong> ${leadData?.email || 'N/A'}</p>
      <p><strong>Phone:</strong> ${leadData?.phone || 'Not specified'}</p>
      <p><strong>Needs:</strong></p>
      <p>${leadData?.needs || leadData?.summary || 'Not specified'}</p>
      <hr/>
      <p><small>You're receiving this email because your plan includes lead notifications (Pro/Premium).</small></p>
    `
  }, 'lead notification');

  if (!result.delivered) {
    await alertPlatform(
      'Lead notification could not be emailed to a customer',
      {
        site: siteData?.domain || null,
        recipient,
        reason: result.error,
        note: 'The lead itself is saved — only the notification failed.'
      },
      `lead-email:${result.error}`
    );
  }

  return result;
}
