/**
 * Central runtime configuration — tune values here only.
 */
export const APP = {
  redis: {
    lock: {
      maxAttempts: 5,
      retryBaseDelayMs: 50,
      inventoryTtlSeconds: 15,
      poTtlSeconds: 15,
    },
    healthCheckTtlMs: 10 * 60 * 1000,
  },

  queue: {
    audit: 'audit-queue',
    notification: 'notification-queue',
    workerDrainDelaySeconds: 30 * 60,
    workerStalledIntervalMs: 30 * 60 * 1000,
    removeOnComplete: 200,
    removeOnFail: 100,
    domainEvents: {
      INVENTORY_LOW_STOCK: 'inventory.low_stock.v1',
      PO_RECEIVED: 'po.received.v1',
      INVOICE_PAID: 'invoice.paid.v1',
    },
  },

  invoice: {
    sequenceName: 'invoice',
    numberPad: 6,
  },

  import: {
    previewTtlSeconds: 900,
    maxRows: 5_000,
    maxFileBytes: 2 * 1024 * 1024,
    product: {
      categoryDescription: 'Import from data',
    },
    supplier: {
      headers: [
        'name',
        'phone',
        'email',
        'address',
        'tax_code',
        'status',
      ],
    },
    po: {
      headers: [
        'po_group',
        'supplier_phone',
        'product_sku',
        'quantity',
        'cost_price',
        'expected_date',
      ],
    },
  },

  report: {
    cacheTtlSeconds: 300,
    types: {
      REVENUE: 'REVENUE',
      TOP_PRODUCTS: 'TOP_PRODUCTS',
      LOW_STOCK: 'LOW_STOCK',
      DEAD_STOCK: 'DEAD_STOCK',
    },
  },

  rbac: {
    cacheTtlSeconds: 86_400,
    permissionsCacheKey: 'rbac:permissions',
  },

  csv: {
    exportMaxRows: 10_000,
  },

  priceTier: {
    maxCustom: 1,
    retailCode: 'RETAIL',
    systemCodes: ['WHOLESALE', 'VIP', 'RETAIL'],
    defaultTiers: [
      { code: 'WHOLESALE', label: 'Giá sỉ', sort_order: 1 },
      { code: 'VIP', label: 'Giá VIP', sort_order: 2 },
      { code: 'RETAIL', label: 'Giá lẻ', sort_order: 3 },
    ],
  },

  notification: {
    types: {
      LOW_STOCK: 'LOW_STOCK',
      PO_RECEIVED: 'PO_RECEIVED',
      INVOICE_PAID: 'INVOICE_PAID',
    },
  },

  cors: {
    localOrigins: ['http://localhost:3001', 'http://localhost:3000'],
  },
} as const;

export type DomainEventType =
  (typeof APP.queue.domainEvents)[keyof typeof APP.queue.domainEvents];

export type ReportType =
  (typeof APP.report.types)[keyof typeof APP.report.types];

export type NotificationType =
  (typeof APP.notification.types)[keyof typeof APP.notification.types];

export type ProductImportMode = 'create_only' | 'upsert';

export type SupplierImportMode = 'create_only' | 'upsert';

export type SystemPriceTierCode = (typeof APP.priceTier.systemCodes)[number];

export function formatInvoiceNumber(seq: number): string {
  return `INV${String(seq).padStart(APP.invoice.numberPad, '0')}`;
}

export function dashboardCacheKey(tenantId: string): string {
  return `${tenantId}:report:dashboard`;
}

export function rbacRoleCacheKey(tenantId: string, roleId: string): string {
  return `${tenantId}:rbac:role:${roleId}`;
}

export function rbacTenantRolesCachePattern(tenantId: string): string {
  return `${tenantId}:rbac:role:*`;
}

export interface DomainEventPayload {
  type: DomainEventType | string;
  tenantId: string;
  actorUserId?: string;
  data: Record<string, unknown>;
}

export interface AuditJobPayload {
  tenant_id?: string;
  user_id?: string;
  action: string;
  module: string;
  entity_id?: string;
  status: string;
  old_value?: Record<string, unknown>;
  new_value?: Record<string, unknown>;
  ip_address?: string;
  metadata?: Record<string, unknown>;
}
