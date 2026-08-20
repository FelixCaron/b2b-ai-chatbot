-- Migration: 20260811000001_stripe_billing.sql
-- Adds Stripe billing fields to tenants table

-- Stripe subscription tracking
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_status TEXT DEFAULT 'free';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;

-- Ensure plan column has default 'free' (was already there from init schema, but let's confirm)
ALTER TABLE tenants ALTER COLUMN plan SET DEFAULT 'free';

-- Create an index for fast webhook lookups by stripe_customer_id
CREATE INDEX IF NOT EXISTS tenants_stripe_customer_id_idx ON tenants(stripe_customer_id);

-- Comment on columns for documentation
COMMENT ON COLUMN tenants.plan IS 'Current subscription plan: basic, pro, premium';
COMMENT ON COLUMN tenants.plan_status IS 'Stripe subscription status: free, active, trialing, canceled, past_due';
COMMENT ON COLUMN tenants.stripe_customer_id IS 'Stripe Customer ID (cus_...)';
COMMENT ON COLUMN tenants.stripe_subscription_id IS 'Stripe Subscription ID (sub_...)';
COMMENT ON COLUMN tenants.plan_expires_at IS 'UTC timestamp of when the current billing period ends';
