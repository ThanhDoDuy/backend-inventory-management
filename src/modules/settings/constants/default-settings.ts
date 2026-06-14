export const DEFAULT_SETTINGS = [
  {
    key: 'sales.max_discount_staff',
    value: '10',
    type: 'NUMBER',
    group: 'SALES',
    description: 'Max discount percentage for staff',
  },
  {
    key: 'sales.max_discount_manager',
    value: '30',
    type: 'NUMBER',
    group: 'SALES',
    description: 'Max discount percentage for manager',
  },
  {
    key: 'inventory.allow_negative_stock',
    value: 'false',
    type: 'BOOLEAN',
    group: 'INVENTORY',
    description: 'Allow stock below zero',
  },
  {
    key: 'inventory.low_stock_threshold',
    value: '20',
    type: 'NUMBER',
    group: 'INVENTORY',
    description: 'Default low stock threshold',
  },
] as const;
