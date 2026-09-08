-- ---------------------------------------------------------------------------
-- "Is the widget actually installed?" — a real signal, not a manual checkbox.
--
-- The install modal used to only ever show the embed snippet and a "Done"
-- button: there was no way to tell a tenant who pasted it correctly from one
-- who hasn't gotten to it yet. The one honest signal we already have is the
-- widget calling api/chat/init on load, from the visitor's own browser — so
-- record when that last happened, scoped to a request that actually came
-- from the site's own domain (the admin's own preview, and any other origin,
-- must not count, or every site would look "installed" the moment its owner
-- previewed it once from the dashboard).
-- ---------------------------------------------------------------------------

ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS widget_last_seen_at TIMESTAMPTZ;

COMMENT ON COLUMN public.sites.widget_last_seen_at IS
  'Last time api/chat/init was called from a request whose Origin matched this site''s own domain — i.e. the widget script is actually live on the site. NULL means never observed. Not touched by admin preview traffic (that runs on our own origin, not the tenant''s).';
