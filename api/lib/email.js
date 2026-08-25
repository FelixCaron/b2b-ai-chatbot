import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;
const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
const systemEmail = 'noreply@b2b-chatbot.com'; // TODO: swap for a real Repondo domain once one is registered (see TODO.md)

const resend = resendApiKey ? new Resend(resendApiKey) : null;

export async function sendBugAlertEmail(error, context) {
  if (!resend) {
    console.warn('RESEND_API_KEY is not configured. Bug alert not sent.');
    return;
  }

  try {
    await resend.emails.send({
      from: `Repondo <${systemEmail}>`,
      to: adminEmail,
      subject: `🚨 [BUG ALERT] Error in Repondo`,
      html: `
        <h2>An error occurred in the Repondo application</h2>
        <h3>Error:</h3>
        <pre>${error?.message || String(error)}</pre>
        <h3>Stack:</h3>
        <pre>${error?.stack || 'No stack trace'}</pre>
        <h3>Context:</h3>
        <pre>${JSON.stringify(context || {}, null, 2)}</pre>
      `
    });
  } catch (err) {
    console.error('Failed to send bug alert email', err);
  }
}

export async function sendLeadEmail(leadData, siteData) {
  if (!resend) {
    console.warn('RESEND_API_KEY is not configured. Lead email not sent.');
    return;
  }

  const recipient = siteData?.support_email || adminEmail;

  try {
    await resend.emails.send({
      from: `Repondo <${systemEmail}>`,
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
    });
  } catch (err) {
    console.error('Failed to send lead email', err);
  }
}
