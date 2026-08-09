-- Migration: 20260808000005_add_lead_toggle_and_theme.sql

ALTER TABLE sites ADD COLUMN IF NOT EXISTS enable_lead_capture BOOLEAN DEFAULT FALSE;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS theme_primary_color TEXT DEFAULT '#6366f1';
