import { PERMISSIONS } from '../../../shared/constants/permission.constants';
import { Role as RoleCode } from '../../../shared/constants/roles.enum';

export interface SeedPermission {
  code: string;
  module: string;
  action: string;
  description: string;
}

export interface SeedRole {
  code: RoleCode;
  name: string;
  description: string;
  is_wildcard: boolean;
  permission_codes: string[];
}

function parsePermissionCode(code: string): Omit<SeedPermission, 'code'> {
  const [module, action] = code.split(':');
  return {
    module: module ?? code,
    action: action ?? '*',
    description: code,
  };
}

function collectPermissionCodes(
  obj: Record<string, unknown>,
  acc: Set<string> = new Set(),
): string[] {
  for (const value of Object.values(obj)) {
    if (typeof value === 'string') {
      acc.add(value);
    } else if (value && typeof value === 'object') {
      collectPermissionCodes(value as Record<string, unknown>, acc);
    }
  }
  return [...acc];
}

export const SEED_PERMISSIONS: SeedPermission[] = collectPermissionCodes(
  PERMISSIONS as unknown as Record<string, unknown>,
)
  .filter((code) => code !== PERMISSIONS.WILDCARD)
  .map((code) => ({
    code,
    ...parsePermissionCode(code),
  }));

const MANAGER_PERMISSION_CODES = [
  PERMISSIONS.PRODUCTS.ALL,
  PERMISSIONS.INVENTORY.VIEW,
  PERMISSIONS.INVENTORY.STOCK_IN,
  PERMISSIONS.INVENTORY.ADJUST,
  PERMISSIONS.PO.CREATE,
  PERMISSIONS.PO.UPDATE,
  PERMISSIONS.PO.VIEW,
  PERMISSIONS.PO.APPROVE,
  PERMISSIONS.PO.RECEIVE,
  PERMISSIONS.PO.CANCEL,
  PERMISSIONS.INVOICE.CREATE,
  PERMISSIONS.INVOICE.VIEW,
  PERMISSIONS.INVOICE.CANCEL,
  PERMISSIONS.INVOICE.REFUND,
  PERMISSIONS.INVOICE.APPLY_DISCOUNT,
  PERMISSIONS.CUSTOMERS.ALL,
  PERMISSIONS.SUPPLIERS.ALL,
  PERMISSIONS.REPORTS.VIEW,
  PERMISSIONS.NOTIFICATIONS.VIEW,
  PERMISSIONS.AUDIT.VIEW,
  PERMISSIONS.AUTH.LOGIN,
  PERMISSIONS.AUTH.LOGOUT,
  PERMISSIONS.AUTH.REFRESH,
];

const STAFF_PERMISSION_CODES = [
  PERMISSIONS.PRODUCTS.VIEW,
  PERMISSIONS.INVENTORY.VIEW,
  PERMISSIONS.INVENTORY.STOCK_IN,
  PERMISSIONS.PO.RECEIVE,
  PERMISSIONS.INVOICE.CREATE,
  PERMISSIONS.INVOICE.VIEW,
  PERMISSIONS.NOTIFICATIONS.VIEW,
  PERMISSIONS.AUTH.LOGIN,
  PERMISSIONS.AUTH.LOGOUT,
  PERMISSIONS.AUTH.REFRESH,
];

export const SEED_ROLES: SeedRole[] = [
  {
    code: RoleCode.ADMIN,
    name: 'Administrator',
    description: 'Full access to all modules',
    is_wildcard: true,
    permission_codes: [PERMISSIONS.WILDCARD],
  },
  {
    code: RoleCode.MANAGER,
    name: 'Manager',
    description: 'Operational business manager',
    is_wildcard: false,
    permission_codes: MANAGER_PERMISSION_CODES,
  },
  {
    code: RoleCode.STAFF,
    name: 'Staff',
    description: 'Execution-level daily operations',
    is_wildcard: false,
    permission_codes: STAFF_PERMISSION_CODES,
  },
];
