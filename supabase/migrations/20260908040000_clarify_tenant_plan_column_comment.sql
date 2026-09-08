-- =============================================================================
-- MIGRATION: 20260908040000_clarify_tenant_plan_column_comment.sql
-- PURPOSE  : tenants.plan's comment only documented the three paid tiers
--            (basic/pro/premium), but 'free' is the column's own DEFAULT and
--            every tenant's real value until they subscribe (see
--            plan-limits.js's "any unknown/legacy plan value" fallback,
--            which exists specifically to handle it). The internal-admin
--            staff console's plan editor followed that same incomplete list,
--            which meant it couldn't display or re-set a tenant's plan back
--            to 'free' — see the accompanying app-code fix. No schema
--            change, just correcting the documentation to match reality.
-- =============================================================================

COMMENT ON COLUMN tenants.plan IS 'Current subscription plan: free (never subscribed), basic, pro, premium';
