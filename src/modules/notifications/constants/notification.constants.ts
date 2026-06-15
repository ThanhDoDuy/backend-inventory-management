export const NOTIFICATION_TYPES = {
  LOW_STOCK: 'LOW_STOCK',
  PO_RECEIVED: 'PO_RECEIVED',
  INVOICE_PAID: 'INVOICE_PAID',
} as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];
