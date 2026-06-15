export const DEFAULT_FEATURE_FLAGS = [
  {
    key: 'enable_refund',
    enabled: true,
    description: 'Allow refund feature',
  },
  {
    key: 'enable_partial_payment',
    enabled: false,
    description: 'Allow partial payment on invoices',
  },
  {
    key: 'enable_low_stock_alert',
    enabled: true,
    description: 'Send low stock notifications',
  },
] as const;
