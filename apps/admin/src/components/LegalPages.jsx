import React from 'react';
import { ShieldCheck, FileText, AlertTriangle } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────
// DRAFT NOTICE — read before removing this component or the banner below.
// This content was drafted from the codebase's actual data practices (which
// third-party subprocessors are called, what's stored, how long guest data
// lives, etc.) so it's accurate about what the product technically does.
// It is NOT a substitute for review by a lawyer licensed in Québec before
// this product takes real paying customers or real visitor data. Known
// placeholders to replace before that: the legal entity name (no company is
// registered yet — see TODO.md's new "Administratif" section), and the
// contact email addresses below.
// ─────────────────────────────────────────────────────────────────────────

const PRODUCT_NAME = 'Repondo';
const CONTACT_EMAIL = 'privacy@your-domain.com';
const GENERAL_EMAIL = 'hello@your-domain.com';
const LAST_UPDATED = 'August 25, 2026';

function DraftBanner() {
  return (
    <div className="mb-8 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
      <p>
        This document is a working draft, not final legal advice. It should be reviewed by a
        lawyer before being relied on commercially. Placeholders (company name, contact email)
        are marked in <code className="text-amber-300">[brackets]</code> where they still need
        real values.
      </p>
    </div>
  );
}

function LegalShell({ icon, title, children }) {
  return (
    <div className="py-12 px-6 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
          {icon}
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{title}</h1>
      </div>
      <p className="text-xs text-gray-500 mb-8">Last updated: {LAST_UPDATED}</p>
      <DraftBanner />
      <div className="space-y-8 text-sm leading-relaxed text-gray-300">{children}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h2 className="text-lg font-bold text-white mb-2">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function PrivacyPolicy() {
  return (
    <LegalShell icon={<ShieldCheck className="w-5 h-5" />} title="Privacy Policy">
      <p>
        [Legal entity name — not yet registered] ("<strong>we</strong>", "<strong>us</strong>",
        the "<strong>{PRODUCT_NAME}</strong>") operates a service that lets businesses (
        "<strong>Customers</strong>") deploy an AI chatbot trained on their own website content
        for their website visitors ("<strong>Visitors</strong>"). This policy explains what
        personal information we collect, why, and what rights you have over it.
      </p>

      <Section title="1. Information we collect">
        <p><strong>From Customers (account holders):</strong></p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Email address, used to authenticate you (magic link) and for account communications.</li>
          <li>Website URLs you submit for us to crawl and index, and the resulting page content, which we store to power your chatbot's answers.</li>
          <li>Billing information processed by Stripe (see "Third parties" below) — we do not store your card number ourselves.</li>
        </ul>
        <p className="pt-2"><strong>From your website's Visitors, when they use the embedded chatbot:</strong></p>
        <ul className="list-disc pl-5 space-y-1">
          <li>The messages they send to and receive from the chatbot.</li>
          <li>If you enable lead capture: name, email, phone number, or other details a Visitor voluntarily provides in the chat.</li>
          <li>A randomly generated session identifier stored in the Visitor's browser (localStorage) so a conversation can continue across messages. It is not a persistent cross-site tracking identifier and is scoped to your chatbot only.</li>
        </ul>
      </Section>

      <Section title="2. Why we process this information">
        <ul className="list-disc pl-5 space-y-1">
          <li>To operate the core service: crawling and indexing the content you authorize, generating chatbot answers, and capturing leads when you turn that feature on.</li>
          <li>To authenticate you and secure your account and data from other Customers (strict tenant isolation is enforced at the database level).</li>
          <li>To bill your subscription and communicate about your account.</li>
          <li>To protect the service against abuse (e.g. bot/spam protection on public forms).</li>
        </ul>
      </Section>

      <Section title="3. Third parties we share data with (subprocessors)">
        <p>We rely on the following infrastructure providers to run the service. Some are located outside Canada, meaning your data may be processed or stored in other jurisdictions (notably the United States) — by using the service you consent to this transfer, consistent with Québec's Act respecting the protection of personal information in the private sector.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Supabase</strong> — database, authentication, and file storage.</li>
          <li><strong>Vercel</strong> — application hosting and edge compute.</li>
          <li><strong>OpenRouter</strong> — routes chatbot conversations to the underlying AI language model that generates responses.</li>
          <li><strong>Jina AI</strong> — reads and converts your website's pages into text, and generates the embeddings used for search.</li>
          <li><strong>Stripe</strong> — payment processing for paid subscriptions.</li>
          <li><strong>Resend</strong> — transactional email delivery (e.g. lead notifications).</li>
          <li><strong>Cloudflare (Turnstile)</strong> — invisible bot/abuse protection on public-facing forms.</li>
        </ul>
        <p>We do not sell personal information.</p>
      </Section>

      <Section title="4. Data retention">
        <ul className="list-disc pl-5 space-y-1">
          <li>Trial ("guest") accounts created without signing up are automatically and permanently deleted after 24 hours, along with every website, page, and conversation under them.</li>
          <li>For registered Customers, data is retained for as long as your account is active. You can delete an individual website (and everything indexed under it) at any time from the dashboard, or request full account deletion by contacting us.</li>
          <li>Visitor chat messages are retained under the Customer's account per the above, so a Customer can review their own chatbot's conversation history.</li>
        </ul>
      </Section>

      <Section title="5. Your rights">
        <p>Subject to applicable law (including Québec's Law 25 and, where applicable, PIPEDA), you may request access to, correction of, or deletion of your personal information, and may withdraw consent to non-essential processing. To exercise these rights, contact <a className="text-brand-400 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
        <p>[Placeholder — a specific individual should be designated as the person responsible for the protection of personal information, as required under Québec Law 25, and named here.]</p>
      </Section>

      <Section title="6. Security">
        <p>We use industry-standard measures including encrypted connections (HTTPS/TLS), database-level tenant isolation (Row Level Security) so one Customer's data is never queryable by another, and ownership checks on account-changing actions. No method of transmission or storage is 100% secure, and we cannot guarantee absolute security.</p>
      </Section>

      <Section title="7. Children's privacy">
        <p>The service is intended for business use and is not directed at children. We do not knowingly collect personal information from children.</p>
      </Section>

      <Section title="8. Changes to this policy">
        <p>We may update this policy from time to time. Material changes will be reflected by updating the "Last updated" date above.</p>
      </Section>

      <Section title="9. Contact">
        <p>Questions about this policy or your data: <a className="text-brand-400 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> (or <a className="text-brand-400 hover:underline" href={`mailto:${GENERAL_EMAIL}`}>{GENERAL_EMAIL}</a> for general inquiries).</p>
      </Section>
    </LegalShell>
  );
}

export function TermsOfService() {
  return (
    <LegalShell icon={<FileText className="w-5 h-5" />} title="Terms of Service">
      <p>
        These Terms govern your access to and use of the {PRODUCT_NAME} service, operated by
        [Legal entity name — not yet registered] (the "<strong>Provider</strong>"). By creating an
        account or using the service, you ("<strong>Customer</strong>", "<strong>you</strong>")
        agree to these Terms.
      </p>

      <Section title="1. The service">
        <p>{PRODUCT_NAME} crawls website content you authorize, indexes it, and uses it to power an AI chatbot you can embed on your website. Responses are generated by a third-party AI language model based on the content indexed and general knowledge, and are provided for informational purposes.</p>
      </Section>

      <Section title="2. Your account">
        <p>You're responsible for the accuracy of the information you provide and for maintaining the confidentiality of your account access. You must be authorized to submit the website(s) you connect to the service — you may only crawl and index content you own or are otherwise permitted to use.</p>
      </Section>

      <Section title="3. Subscription plans & billing">
        <ul className="list-disc pl-5 space-y-1">
          <li>Paid plans are billed on a recurring subscription basis through Stripe and renew automatically until cancelled.</li>
          <li>You can manage or cancel your subscription at any time from the billing portal in your dashboard.</li>
          <li>Fees are non-refundable except where required by applicable law.</li>
          <li>[Placeholder — confirm whether GST/QST registration applies and whether tax is added at checkout.]</li>
        </ul>
      </Section>

      <Section title="4. Acceptable use">
        <p>You agree not to use the service to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Crawl, index, or distribute content you do not have the right to use.</li>
          <li>Submit or attempt to make the service access internal, private, or non-public network destinations.</li>
          <li>Deploy a chatbot that harasses, defrauds, or misleads visitors, or that collects sensitive personal information (e.g. health, financial account numbers) beyond what the built-in lead capture feature is designed for.</li>
          <li>Attempt to circumvent plan limits, rate limits, or security controls, or interfere with the service's normal operation.</li>
        </ul>
        <p>We may suspend or terminate accounts that violate this section.</p>
      </Section>

      <Section title="5. AI-generated content disclaimer">
        <p>Chatbot responses are generated automatically by AI and may be incomplete, out of date, or incorrect. You are responsible for reviewing how your chatbot behaves and for any consequences of visitors relying on its responses. The service is provided on an "as is" and "as available" basis, without warranties of any kind, express or implied.</p>
      </Section>

      <Section title="6. Intellectual property">
        <p>You retain all rights to the content on your website and to leads/conversations collected through your chatbot. We retain all rights to the {PRODUCT_NAME} software, platform, and branding. Nothing in these Terms transfers ownership of either party's pre-existing intellectual property to the other.</p>
      </Section>

      <Section title="7. Limitation of liability">
        <p>To the maximum extent permitted by applicable law, the Provider will not be liable for indirect, incidental, special, or consequential damages, or for lost profits or data, arising from your use of the service. Our total liability for any claim relating to the service is limited to the amount you paid us in the three (3) months preceding the claim.</p>
      </Section>

      <Section title="8. Termination">
        <p>Either party may terminate at any time; you may cancel from your dashboard or by contacting us. Upon termination, we will delete your data in accordance with our Privacy Policy, subject to any legal retention requirements.</p>
      </Section>

      <Section title="9. Governing law">
        <p>These Terms are governed by the laws of the Province of Québec and the federal laws of Canada applicable therein, without regard to conflict-of-law principles. Any dispute will be submitted to the exclusive jurisdiction of the courts located in Québec, Canada.</p>
      </Section>

      <Section title="10. Changes to these Terms">
        <p>We may update these Terms from time to time. Continued use of the service after changes take effect constitutes acceptance of the revised Terms.</p>
      </Section>

      <Section title="11. Contact">
        <p><a className="text-brand-400 hover:underline" href={`mailto:${GENERAL_EMAIL}`}>{GENERAL_EMAIL}</a></p>
      </Section>
    </LegalShell>
  );
}
