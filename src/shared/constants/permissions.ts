import { Role } from './roles.enum';

const MANAGER_PERMISSIONS = [
  'products:*',
  'inventory:view',
  'inventory:stock_in',
  'inventory:adjust',
  'po:create',
  'po:update',
  'po:view',
  'po:approve',
  'po:receive',
  'po:cancel',
  'invoice:create',
  'invoice:view',
  'invoice:cancel',
  'invoice:refund',
  'invoice:apply_discount',
  'customers:*',
  'suppliers:*',
  'reports:view',
  'notifications:view',
  'audit:view',
  'auth:login',
  'auth:logout',
  'auth:refresh',
];

const STAFF_PERMISSIONS = [
  'products:view',
  'inventory:view',
  'inventory:stock_in',
  'po:receive',
  'invoice:create',
  'invoice:view',
  'notifications:view',
  'auth:login',
  'auth:logout',
  'auth:refresh',
];

export function getPermissionsForRole(role: Role): string[] {
  switch (role) {
    case Role.ADMIN:
      return ['*'];
    case Role.MANAGER:
      return MANAGER_PERMISSIONS;
    case Role.STAFF:
      return STAFF_PERMISSIONS;
    default:
      return [];
  }
}

export function hasPermission(role: Role, required: string): boolean {
  const permissions = getPermissionsForRole(role);
  if (permissions.includes('*')) {
    return true;
  }
  if (permissions.includes(required)) {
    return true;
  }
  const [resource] = required.split(':');
  return permissions.includes(`${resource}:*`);
}
