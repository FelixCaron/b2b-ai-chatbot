-- ===========================================================================
-- sites.favicon_url — the website's own declared favicon
-- ===========================================================================
-- Captured once at add-site/rescan time (api/chat/theme.js parses it out of
-- the site's real HTML, the same way a browser tab resolves one) and shown
-- in the dashboard's SiteHeroCard instead of a third-party favicon-guessing
-- service, which turned out to sometimes hand back a generic/wrong icon
-- instead of the site's actual one.
--
-- Nullable with no default: older sites (added before this existed) simply
-- have none until their next rescan re-populates it, at which point the
-- dashboard's own fallback chain (site's own favicon.ico path, then a
-- favicon lookup service, then a generic icon) covers the gap.
-- ===========================================================================

ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS favicon_url TEXT;

COMMENT ON COLUMN public.sites.favicon_url IS
  'The website''s own declared favicon URL, parsed from its HTML at add-site/rescan time. NULL until the next scan for sites added before this column existed.';
