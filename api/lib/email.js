import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;
const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
const systemEmail = 'noreply@b2b-chatbot.com';

const resend = resendApiKey ? new Resend(resendApiKey) : null;

export async function sendBugAlertEmail(error, context) {
  if (!resend) {
    console.warn('RESEND_API_KEY is not configured. Bug alert not sent.');
    return;
  }

  try {
    await resend.emails.send({
      from: `B2B Chatbot System <${systemEmail}>`,
      to: adminEmail,
      subject: `🚨 [BUG ALERT] Error in B2B Chatbot`,
      html: `
        <h2>An error occurred in the B2B Chatbot application</h2>
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
      from: `B2B Chatbot System <${systemEmail}>`,
      to: recipient,
      subject: `🚀 Nouveau Lead généré pour ${siteData?.domain || 'votre site'} !`,
      html: `
        <h2>Un nouveau lead a été collecté !</h2>
        <p><strong>Site :</strong> ${siteData?.domain || 'N/A'}</p>
        <p><strong>Nom / Compagnie :</strong> ${leadData?.name || 'Non spécifié'}</p>
        <p><strong>Email :</strong> ${leadData?.email || 'N/A'}</p>
        <p><strong>Téléphone :</strong> ${leadData?.phone || 'Non spécifié'}</p>
        <p><strong>Besoins :</strong></p>
        <p>${leadData?.needs || leadData?.summary || 'Non spécifiés'}</p>
        <hr/>
        <p><small>Ce courriel vous a été envoyé car vous bénéficiez du plan Premium/Pro.</small></p>
      `
    });
  } catch (err) {
    console.error('Failed to send lead email', err);
  }
}
