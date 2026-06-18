export const AUDIT_QUEUE = 'audit-queue';
export const NOTIFICATION_QUEUE = 'notification-queue';

/** Long-poll interval when queue is empty (seconds). Default BullMQ is 5s. */
export const WORKER_DRAIN_DELAY_SECONDS = 30 * 60;

/** Stalled job check interval (ms). Default BullMQ is 30_000 (30s). */
export const WORKER_STALLED_INTERVAL_MS = 30 * 60 * 1000;

export const DOMAIN_EVENTS = {
  INVENTORY_LOW_STOCK: 'inventory.low_stock.v1',
  PO_RECEIVED: 'po.received.v1',
  INVOICE_PAID: 'invoice.paid.v1',
} as const;

export type DomainEventType =
  (typeof DOMAIN_EVENTS)[keyof typeof DOMAIN_EVENTS];

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
