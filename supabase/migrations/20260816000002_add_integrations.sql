-- Migration: 20260816000002_add_integrations.sql
-- Adds integration settings for the new Pro plan

ALTER TABLE sites ADD COLUMN IF NOT EXISTS support_email TEXT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS calendar_link TEXT;

COMMENT ON COLUMN sites.support_email IS 'Email address to receive support requests from the chatbot';
COMMENT ON COLUMN sites.calendar_link IS 'Booking link (e.g., Calendly, Cal.com) for the chatbot to provide for appointments';
