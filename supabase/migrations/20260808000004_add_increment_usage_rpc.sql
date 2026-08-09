-- Migration: 20260808000004_add_increment_usage_rpc.sql

CREATE OR REPLACE FUNCTION public.increment_usage(target_tenant_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO usage (tenant_id, messages_count, leads_count, updated_at)
  VALUES (target_tenant_id, 1, 0, NOW())
  ON CONFLICT (tenant_id)
  DO UPDATE SET messages_count = usage.messages_count + 1, updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_lead_usage(target_tenant_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO usage (tenant_id, messages_count, leads_count, updated_at)
  VALUES (target_tenant_id, 0, 1, NOW())
  ON CONFLICT (tenant_id)
  DO UPDATE SET leads_count = usage.leads_count + 1, updated_at = NOW();
END;
$$;
