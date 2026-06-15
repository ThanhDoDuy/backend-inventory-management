export const REPORT_CACHE_TTL_SECONDS = 300;

export function dashboardCacheKey(tenantId: string): string {
  return `${tenantId}:report:dashboard`;
}

export const REPORT_TYPES = {
  REVENUE: 'REVENUE',
  TOP_PRODUCTS: 'TOP_PRODUCTS',
  LOW_STOCK: 'LOW_STOCK',
  DEAD_STOCK: 'DEAD_STOCK',
} as const;

export type ReportType = (typeof REPORT_TYPES)[keyof typeof REPORT_TYPES];
