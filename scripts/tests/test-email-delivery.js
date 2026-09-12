// ---------------------------------------------------------------------------
// Does a failed email report itself as failed?
//
// This exists because of a bug that was invisible by construction: the Resend
// SDK never throws on a rejected send — a bad key, an unverified sending
// domain, a malformed recipient and a network error all come back as a
// *resolved* `{ data: null, error }`. api/_lib/email.js awaited that inside a
// try/catch and returned success because nothing threw, so every failure was
// reported as a delivery: support requests that never arrived were recorded
// as sent, the assistant promised visitors a reply, and nothing was logged.
//
// The whole failure mode is "the happy path looks identical to the broken
// one", which is exactly what a test has to hold down. Resend is stubbed at
// the `fetch` boundary, so no network and no API key are needed.
// ---------------------------------------------------------------------------

process.env.RESEND_API_KEY = 'test_key_not_a_real_one';
process.env.ADMIN_EMAIL = 'platform-team@example.com';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`PASS: ${name}`);
    passed++;
  } else {
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

/** Every request the stubbed Resend endpoint received. */
let sent = [];

/** Point `fetch` at a canned Resend response for the next sends. */
function stubResend(status, body) {
  globalThis.fetch = async (url, options) => {
    sent.push({ url: String(url), body: JSON.parse(options?.body || '{}') });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  };
}

const { sendSupportTicketEmail, sendLeadEmail } = await import('../../dorafi/admin/api/_lib/email.js');

const site = { id: 'site-1', domain: 'acme.example.com', support_email: 'help@acme.example.com' };
const ticket = { name: 'Jane', email: 'jane@example.com', message: 'My order never arrived.' };

// --- 1. Resend rejects the send (the real-world case: unverified domain) ----
sent = [];
stubResend(403, { name: 'validation_error', message: 'The dorafi.logafi.com domain is not verified.' });

const rejected = await sendSupportTicketEmail(ticket, site);

check('a rejected send is reported as NOT delivered', rejected.delivered === false, `got delivered=${rejected.delivered}`);
check(
  'the rejection carries Resend\'s own reason, for diagnosis',
  typeof rejected.error === 'string' && rejected.error.includes('not verified'),
  `got error=${JSON.stringify(rejected.error)}`
);
check(
  'a failed customer email alerts the platform, not the customer',
  sent.some((r) => r.body?.to === 'platform-team@example.com'),
  `recipients seen: ${JSON.stringify(sent.map((r) => r.body?.to))}`
);

// --- 2. A send that actually goes through ----------------------------------
sent = [];
stubResend(200, { id: 'email_123' });

const accepted = await sendSupportTicketEmail(ticket, site);

check('an accepted send is reported as delivered', accepted.delivered === true, `got delivered=${accepted.delivered}`);
check('an accepted send reports no error', accepted.error === null, `got error=${JSON.stringify(accepted.error)}`);
check(
  'the ticket goes to the site\'s own support inbox',
  sent[0]?.body?.to === 'help@acme.example.com',
  `got to=${JSON.stringify(sent[0]?.body?.to)}`
);
check(
  'replying to it reaches the visitor who asked',
  sent[0]?.body?.reply_to === 'jane@example.com' || sent[0]?.body?.replyTo === 'jane@example.com',
  `got reply_to=${JSON.stringify(sent[0]?.body?.reply_to ?? sent[0]?.body?.replyTo)}`
);

// --- 3. A site with nowhere to send to -------------------------------------
sent = [];
stubResend(200, { id: 'email_123' });

const noRecipient = await sendSupportTicketEmail(ticket, { domain: 'acme.example.com' });

check('no support inbox configured is not a delivery', noRecipient.delivered === false);
check('nothing is sent when there is no recipient', sent.length === 0, `${sent.length} request(s) made`);

// --- 4. Lead notifications answer the same question ------------------------
sent = [];
stubResend(422, { name: 'validation_error', message: 'Invalid `to` field.' });

const leadResult = await sendLeadEmail({ name: 'Jane', email: 'jane@example.com' }, site);

check('a rejected lead notification is reported as NOT delivered', leadResult.delivered === false, `got delivered=${leadResult.delivered}`);

console.log(`\nEmail Delivery Test Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
