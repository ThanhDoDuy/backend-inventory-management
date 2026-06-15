export const PERMISSIONS = {
  WILDCARD: '*',

  AUTH: {
    LOGIN: 'auth:login',
    LOGOUT: 'auth:logout',
    REFRESH: 'auth:refresh',
  },

  USERS: {
    CREATE: 'users:create',
    UPDATE: 'users:update',
    VIEW: 'users:view',
    DELETE: 'users:delete',
    ALL: 'users:*',
  },

  PRODUCTS: {
    CREATE: 'products:create',
    UPDATE: 'products:update',
    VIEW: 'products:view',
    DELETE: 'products:delete',
    ALL: 'products:*',
  },

  INVENTORY: {
    VIEW: 'inventory:view',
    STOCK_IN: 'inventory:stock_in',
    STOCK_OUT: 'inventory:stock_out',
    ADJUST: 'inventory:adjust',
    REBUILD: 'inventory:rebuild',
  },

  PO: {
    CREATE: 'po:create',
    UPDATE: 'po:update',
    VIEW: 'po:view',
    APPROVE: 'po:approve',
    RECEIVE: 'po:receive',
    CANCEL: 'po:cancel',
  },

  INVOICE: {
    CREATE: 'invoice:create',
    VIEW: 'invoice:view',
    CANCEL: 'invoice:cancel',
    REFUND: 'invoice:refund',
    APPLY_DISCOUNT: 'invoice:apply_discount',
  },

  CUSTOMERS: {
    CREATE: 'customers:create',
    UPDATE: 'customers:update',
    VIEW: 'customers:view',
    DISABLE: 'customers:disable',
    ALL: 'customers:*',
  },

  SUPPLIERS: {
    CREATE: 'suppliers:create',
    UPDATE: 'suppliers:update',
    VIEW: 'suppliers:view',
    DISABLE: 'suppliers:disable',
    ALL: 'suppliers:*',
  },

  REPORTS: {
    VIEW: 'reports:view',
    EXPORT: 'reports:export',
  },

  NOTIFICATIONS: {
    VIEW: 'notifications:view',
    MARK_READ: 'notifications:mark_read',
  },

  AUDIT: {
    VIEW: 'audit:view',
    EXPORT: 'audit:export',
  },

  SETTINGS: {
    VIEW: 'settings:view',
    UPDATE: 'settings:update',
    ALL: 'settings:*',
  },

  FEATURE_FLAGS: {
    UPDATE: 'feature_flags:update',
    ALL: 'feature_flags:*',
  },

  RBAC: {
    VIEW: 'rbac:view',
    UPDATE: 'rbac:update',
  },
} as const;

type PermissionValue<T> = T extends string
  ? T
  : T extends Record<string, unknown>
    ? PermissionValue<T[keyof T]>
    : never;

export type Permission = PermissionValue<typeof PERMISSIONS>;
