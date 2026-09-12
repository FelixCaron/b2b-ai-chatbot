import { generateWebsiteSummary, generateWelcomeExperience } from './llm.js';

/**
 * Generate and persist a site's business summary and widget welcome
 * experience (greeting, status labels, placeholder, detected language) from
 * a page's extracted text.
 *
 * Both api/crawler/scan.js (auto-triggered once per site, at scan time) and
 * api/crawler/summarize.js (an explicit "regenerate" the owner can trigger)
 * used to carry their own copy of this — same two LLM calls, same
 * upsert-into-site_summaries-or-fall-back-to-documents dance. One drifting
 * from the other was only a matter of time; this is the one place it happens
 * now. Scanning a page and building the assistant's business profile are two
 * different concerns (a scan can index many pages; the summary is generated
 * at most once per page and is one row per site) — pulling this out is what
 * keeps scan.js about scanning a page, not about everything a scan can lead
 * to.
 *
 * Returns the summary text on success, or null if the model produced
 * nothing — callers decide whether that's fatal, and are expected to have
 * already gated on having enough content to bother calling this at all
 * (scan.js and summarize.js each have their own threshold for what "enough"
 * means for their situation).
 */
export async function persistSiteSummary({ supabase, tenantId, siteId, targetUrl, content, apiKey }) {
  if (!content) return null;

  const [summaryText, welcomeExperience] = await Promise.all([
    generateWebsiteSummary({ content, targetUrl, apiKey }),
    generateWelcomeExperience({ content, targetUrl, apiKey }),
  ]);

  if (!summaryText) return null;

  const { error: upsertErr } = await supabase.from('site_summaries').upsert({
    tenant_id: tenantId,
    site_id: siteId,
    summary: summaryText,
    language: welcomeExperience?.language,
    welcome_message: welcomeExperience?.welcome_message,
    ui_status_title: welcomeExperience?.ui_status_title,
    ui_status_online: welcomeExperience?.ui_status_online,
    ui_input_placeholder: welcomeExperience?.ui_input_placeholder,
    updated_at: new Date().toISOString()
  }, { onConflict: 'tenant_id,site_id' });

  if (upsertErr) {
    // Fallback to the documents table if site_summaries isn't there yet on
    // this database (a migration ordering gap, not expected in steady state).
    const summaryUrl = `${targetUrl}#site-summary`;
    await supabase.from('documents').delete().eq('site_id', siteId).eq('url', summaryUrl);
    await supabase.from('documents').insert({
      tenant_id: tenantId,
      site_id: siteId,
      url: summaryUrl,
      content: `[SITE_SUMMARY]\n${summaryText}`
    });
  }

  return summaryText;
}
