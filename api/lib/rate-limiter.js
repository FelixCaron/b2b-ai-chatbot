/**
 * Rate Limiter for Tenants
 * Checks query quotas to ensure tenants do not exceed limits.
 */

class RateLimiter {
    constructor(supabaseClient) {
          this.supabase = supabaseClient;
    }

  /**
     * Check if the tenant has exceeded their query quota.
     * @param {string} tenantId - The unique ID of the tenant
     * @returns {Promise<{ allowed: boolean, remaining: number, limit: number }>}
     */
  async checkQuota(tenantId) {
        if (!tenantId) {
                throw new Error('Tenant ID is required for rate limit check.');
        }

      // Retrieve tenant's limit and current query count from Supabase
      const { data: tenant, error } = await this.supabase
          .from('tenants')
          .select('query_limit, current_query_count')
          .eq('id', tenantId)
          .single();

      if (error) {
              console.error('Error fetching rate limit for tenant:', error);
              // Fail closed for security:
          return { allowed: false, remaining: 0, limit: 0, error: 'Database error' };
      }

      if (!tenant) {
              return { allowed: false, remaining: 0, limit: 0, error: 'Tenant not found' };
      }

      const limit = tenant.query_limit || 1000; // default limit
      const currentCount = tenant.current_query_count || 0;
        const remaining = Math.max(0, limit - currentCount);

      if (currentCount >= limit) {
              return { allowed: false, remaining, limit };
      }

      return { allowed: true, remaining, limit };
  }

  /**
     * Increments the query count for the tenant.
     * @param {string} tenantId - The unique ID of the tenant
     */
  async incrementQueryCount(tenantId) {
        if (!tenantId) return;

      // Use a RPC function or direct increment
      const { error } = await this.supabase.rpc('increment_tenant_query_count', {
              tenant_id: tenantId
      });

      if (error) {
              console.error('Error incrementing tenant query count:', error);

          // Fallback manual update
          const { data: tenant } = await this.supabase
                .from('tenants')
                .select('current_query_count')
                .eq('id', tenantId)
                .single();

          if (tenant) {
                    await this.supabase
                      .from('tenants')
                      .update({ current_query_count: (tenant.current_query_count || 0) + 1 })
                      .eq('id', tenantId);
          }
      }
  }
}

export default RateLimiter;
export { RateLimiter };
