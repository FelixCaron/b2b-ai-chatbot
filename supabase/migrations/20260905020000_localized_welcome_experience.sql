-- =============================================================================
-- MIGRATION: 20260905020000_localized_welcome_experience.sql
-- PURPOSE  : Lets the widget greet a visitor in the scanned site's own
--            language instead of a hardcoded English string — see
--            api/lib/llm.js's generateWelcomeExperience() and
--            api/chat/init.js, which serves these to the widget.
--
--            Lives on site_summaries (already the "AI-generated, once per
--            site" table — see its own header) rather than a new table or
--            columns on `sites`, since these are exactly that: content the
--            model generates once per site, not something a tenant fills in.
-- =============================================================================

ALTER TABLE public.site_summaries ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE public.site_summaries ADD COLUMN IF NOT EXISTS welcome_message TEXT;
ALTER TABLE public.site_summaries ADD COLUMN IF NOT EXISTS ui_status_title TEXT;
ALTER TABLE public.site_summaries ADD COLUMN IF NOT EXISTS ui_status_online TEXT;
ALTER TABLE public.site_summaries ADD COLUMN IF NOT EXISTS ui_input_placeholder TEXT;

COMMENT ON COLUMN public.site_summaries.language IS 'ISO 639-1 code (e.g. en, fr, es) the model detected the site''s own content is written in — drives every other column here.';
COMMENT ON COLUMN public.site_summaries.welcome_message IS 'AI-generated first message shown in the chat widget before the visitor says anything, in `language`, tailored to the business.';
COMMENT ON COLUMN public.site_summaries.ui_status_title IS 'Widget header title (e.g. "Virtual Assistant"), translated to `language`.';
COMMENT ON COLUMN public.site_summaries.ui_status_online IS 'Widget header status line (e.g. "Online"), translated to `language`.';
COMMENT ON COLUMN public.site_summaries.ui_input_placeholder IS 'Widget message-input placeholder (e.g. "Ask a question..."), translated to `language`.';
