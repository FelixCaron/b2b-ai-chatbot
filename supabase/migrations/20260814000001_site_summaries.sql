-- Migration: 20260814000001_site_summaries.sql
-- Table pour stocker les résumés de sites web générés par IA

CREATE TABLE IF NOT EXISTS site_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT site_summaries_tenant_site_unique UNIQUE (tenant_id, site_id)
);

-- Index pour accélérer les recherches par site_id et tenant_id
CREATE INDEX IF NOT EXISTS idx_site_summaries_site_id ON site_summaries(site_id);
CREATE INDEX IF NOT EXISTS idx_site_summaries_tenant_id ON site_summaries(tenant_id);

-- RLS (Row Level Security)
ALTER TABLE site_summaries ENABLE ROW LEVEL SECURITY;
