/** 1 day */
export const RBAC_CACHE_TTL_SECONDS = 86_400;

export const RBAC_PERMISSIONS_CACHE_KEY = 'rbac:permissions';

export function rbacRoleCacheKey(tenantId: string, roleId: string): string {
  return `${tenantId}:rbac:role:${roleId}`;
}

export function rbacTenantRolesCachePattern(tenantId: string): string {
  return `${tenantId}:rbac:role:*`;
}
