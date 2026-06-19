import { HttpStatus } from '@nestjs/common';
import { ErrorDefinition } from './error-definition.interface';

export const ERRORS = {
  COMMON: {
    VALIDATION_FAILED: {
      errorCode: 1000,
      message: 'Validation failed',
      httpStatus: HttpStatus.BAD_REQUEST,
    },
    INTERNAL_ERROR: {
      errorCode: 1001,
      message: 'Internal server error',
      httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    },
  },
  AUTH: {
    INVALID_CREDENTIALS: {
      errorCode: 2000,
      message: 'Invalid credentials',
      httpStatus: HttpStatus.UNAUTHORIZED,
    },
    USER_DISABLED: {
      errorCode: 2001,
      message: 'User account is disabled',
      httpStatus: HttpStatus.UNAUTHORIZED,
    },
    INVALID_REFRESH_TOKEN: {
      errorCode: 2002,
      message: 'Invalid refresh token',
      httpStatus: HttpStatus.UNAUTHORIZED,
    },
    USER_NOT_FOUND_OR_DISABLED: {
      errorCode: 2003,
      message: 'User not found or disabled',
      httpStatus: HttpStatus.UNAUTHORIZED,
    },
    USER_NOT_FOUND: {
      errorCode: 2004,
      message: 'User not found',
      httpStatus: HttpStatus.UNAUTHORIZED,
    },
    TENANT_CONTEXT_MISSING: {
      errorCode: 2005,
      message: 'Tenant context missing in token',
      httpStatus: HttpStatus.UNAUTHORIZED,
    },
    TENANT_MISMATCH: {
      errorCode: 2006,
      message: 'Tenant mismatch',
      httpStatus: HttpStatus.UNAUTHORIZED,
    },
    INVALID_TOKEN: {
      errorCode: 2007,
      message: 'Invalid or expired token',
      httpStatus: HttpStatus.UNAUTHORIZED,
    },
    PASSWORD_UNCHANGED: {
      errorCode: 2008,
      message: 'New password must differ from old password',
      httpStatus: HttpStatus.CONFLICT,
    },
    PASSWORD_RESET_RATE_LIMITED: {
      errorCode: 2009,
      message: 'Too many password reset requests. Please try again later.',
      httpStatus: HttpStatus.TOO_MANY_REQUESTS,
    },
    EMAIL_SEND_FAILED: {
      errorCode: 2010,
      message: 'Unable to send password reset email. Please try again later.',
      httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
    },
    TENANT_CONTEXT_REQUIRED: {
      errorCode: 2100,
      message: 'Tenant context required',
      httpStatus: HttpStatus.FORBIDDEN,
    },
    PERMISSION_DENIED: {
      errorCode: 2101,
      message: 'Permission denied',
      httpStatus: HttpStatus.FORBIDDEN,
    },
  },
  USER: {
    NOT_FOUND: {
      errorCode: 3000,
      message: 'User not found',
      httpStatus: HttpStatus.NOT_FOUND,
    },
    CREATE_FAILED: {
      errorCode: 3001,
      message: 'Failed to create user',
      httpStatus: HttpStatus.BAD_REQUEST,
    },
    EMAIL_IN_USE: {
      errorCode: 3002,
      message: 'Email already in use',
      httpStatus: HttpStatus.CONFLICT,
    },
    LIMIT_REACHED: {
      errorCode: 3003,
      message: 'Maximum users per store reached',
      httpStatus: HttpStatus.CONFLICT,
    },
    OLD_PASSWORD_INCORRECT: {
      errorCode: 3004,
      message: 'Old password is incorrect',
      httpStatus: HttpStatus.CONFLICT,
    },
    ALREADY_ACTIVE: {
      errorCode: 3005,
      message: 'User is already active',
      httpStatus: HttpStatus.CONFLICT,
    },
    SAME_ROLE: {
      errorCode: 3006,
      message: 'User already has this role',
      httpStatus: HttpStatus.CONFLICT,
    },
    LAST_ADMIN_ROLE_CHANGE: {
      errorCode: 3007,
      message:
        'Cannot change role: this is the only admin in the tenant. Assign another admin first.',
      httpStatus: HttpStatus.CONFLICT,
    },
    OWNER_ROLE_IMMUTABLE: {
      errorCode: 3008,
      message: 'Cannot change role of the store owner account',
      httpStatus: HttpStatus.CONFLICT,
    },
  },
  TENANT: {
    LIMIT_REACHED: {
      errorCode: 4000,
      message: 'Platform capacity reached',
      httpStatus: HttpStatus.CONFLICT,
    },
    NOT_FOUND: {
      errorCode: 4001,
      message: 'Tenant not found',
      httpStatus: HttpStatus.NOT_FOUND,
    },
  },
  PRODUCT: {
    NOT_FOUND: {
      errorCode: 6000,
      message: 'Product not found',
      httpStatus: HttpStatus.NOT_FOUND,
    },
    SKU_EXISTS: {
      errorCode: 6001,
      message: 'SKU already exists in this store',
      httpStatus: HttpStatus.CONFLICT,
    },
    BARCODE_EXISTS: {
      errorCode: 6002,
      message: 'Barcode already exists in this store',
      httpStatus: HttpStatus.CONFLICT,
    },
  },
  CATEGORY: {
    NOT_FOUND: {
      errorCode: 6100,
      message: 'Category not found',
      httpStatus: HttpStatus.NOT_FOUND,
    },
    NAME_EXISTS: {
      errorCode: 6101,
      message: 'Category name already exists in this store',
      httpStatus: HttpStatus.CONFLICT,
    },
    CATEGORY_IN_USE: {
      errorCode: 6102,
      message: 'Category is assigned to products and cannot be deleted',
      httpStatus: HttpStatus.CONFLICT,
    },
  },
  INVENTORY: {
    INSUFFICIENT_STOCK: {
      errorCode: 6200,
      message: 'Insufficient stock',
      httpStatus: HttpStatus.CONFLICT,
    },
    DUPLICATE_TRANSACTION: {
      errorCode: 6201,
      message: 'Inventory transaction already exists for this reference',
      httpStatus: HttpStatus.CONFLICT,
    },
    PRODUCT_NOT_FOUND: {
      errorCode: 6202,
      message: 'Product not found',
      httpStatus: HttpStatus.NOT_FOUND,
    },
    LOCK_ACQUISITION_FAILED: {
      errorCode: 6203,
      message: 'Could not acquire inventory lock, please retry',
      httpStatus: HttpStatus.CONFLICT,
    },
    INVALID_QUANTITY: {
      errorCode: 6204,
      message: 'Invalid quantity',
      httpStatus: HttpStatus.BAD_REQUEST,
    },
    BALANCE_NOT_FOUND: {
      errorCode: 6205,
      message: 'Inventory balance not found',
      httpStatus: HttpStatus.NOT_FOUND,
    },
  },
  SUPPLIER: {
    NOT_FOUND: {
      errorCode: 6300,
      message: 'Supplier not found',
      httpStatus: HttpStatus.NOT_FOUND,
    },
    EMAIL_IN_USE: {
      errorCode: 6301,
      message: 'Email already in use for this store',
      httpStatus: HttpStatus.CONFLICT,
    },
    ALREADY_DISABLED: {
      errorCode: 6302,
      message: 'Supplier is already disabled',
      httpStatus: HttpStatus.CONFLICT,
    },
    HAS_PURCHASE_ORDERS: {
      errorCode: 6303,
      message: 'Cannot delete supplier with existing purchase orders',
      httpStatus: HttpStatus.CONFLICT,
    },
  },
  CUSTOMER: {
    NOT_FOUND: {
      errorCode: 6400,
      message: 'Customer not found',
      httpStatus: HttpStatus.NOT_FOUND,
    },
    EMAIL_IN_USE: {
      errorCode: 6401,
      message: 'Email already in use for this store',
      httpStatus: HttpStatus.CONFLICT,
    },
    ALREADY_DISABLED: {
      errorCode: 6402,
      message: 'Customer is already disabled',
      httpStatus: HttpStatus.CONFLICT,
    },
    HAS_INVOICES: {
      errorCode: 6403,
      message: 'Cannot delete customer with existing invoices',
      httpStatus: HttpStatus.CONFLICT,
    },
    TAX_CODE_REQUIRED: {
      errorCode: 6404,
      message: 'Tax code is required for company customers',
      httpStatus: HttpStatus.BAD_REQUEST,
    },
    INVALID_TAX_CODE: {
      errorCode: 6405,
      message: 'Tax code must be 10 or 13 digits',
      httpStatus: HttpStatus.BAD_REQUEST,
    },
    TAX_CODE_NOT_ALLOWED: {
      errorCode: 6406,
      message: 'Tax code is only allowed for company customers',
      httpStatus: HttpStatus.BAD_REQUEST,
    },
    TAX_CODE_IN_USE: {
      errorCode: 6407,
      message: 'Tax code already in use for this store',
      httpStatus: HttpStatus.CONFLICT,
    },
  },
  PO: {
    NOT_FOUND: {
      errorCode: 6500,
      message: 'Purchase order not found',
      httpStatus: HttpStatus.NOT_FOUND,
    },
    NOT_DRAFT: {
      errorCode: 6501,
      message: 'Purchase order can only be updated while in DRAFT status',
      httpStatus: HttpStatus.CONFLICT,
    },
    INVALID_STATUS: {
      errorCode: 6502,
      message: 'Purchase order status does not allow this action',
      httpStatus: HttpStatus.CONFLICT,
    },
    LOCK_ACQUISITION_FAILED: {
      errorCode: 6503,
      message: 'Could not acquire purchase order lock, please retry',
      httpStatus: HttpStatus.CONFLICT,
    },
    ITEM_NOT_FOUND: {
      errorCode: 6504,
      message: 'Product is not part of this purchase order',
      httpStatus: HttpStatus.BAD_REQUEST,
    },
    RECEIVE_QUANTITY_EXCEEDED: {
      errorCode: 6505,
      message: 'Received quantity exceeds remaining ordered quantity',
      httpStatus: HttpStatus.BAD_REQUEST,
    },
    NO_ITEMS: {
      errorCode: 6506,
      message: 'Purchase order must have at least one item',
      httpStatus: HttpStatus.BAD_REQUEST,
    },
    ALREADY_CANCELLED: {
      errorCode: 6507,
      message: 'Purchase order is already cancelled',
      httpStatus: HttpStatus.CONFLICT,
    },
  },
  INVOICE: {
    NOT_FOUND: {
      errorCode: 6600,
      message: 'Invoice not found',
      httpStatus: HttpStatus.NOT_FOUND,
    },
    INVALID_STATUS: {
      errorCode: 6601,
      message: 'Invoice status does not allow this operation',
      httpStatus: HttpStatus.CONFLICT,
    },
    EMPTY_ITEMS: {
      errorCode: 6602,
      message: 'At least one invoice item is required',
      httpStatus: HttpStatus.BAD_REQUEST,
    },
    CUSTOMER_NOT_FOUND: {
      errorCode: 6603,
      message: 'Customer not found',
      httpStatus: HttpStatus.NOT_FOUND,
    },
    CUSTOMER_DISABLED: {
      errorCode: 6608,
      message: 'Customer is disabled',
      httpStatus: HttpStatus.CONFLICT,
    },
    CUSTOMER_TYPE_NOT_ALLOWED: {
      errorCode: 6609,
      message: 'Only company or group customers can be linked to this invoice',
      httpStatus: HttpStatus.BAD_REQUEST,
    },
    DISCOUNT_EXCEEDED: {
      errorCode: 6604,
      message: 'Discount exceeds allowed limit for your role',
      httpStatus: HttpStatus.FORBIDDEN,
    },
    REFUND_QUANTITY_EXCEEDED: {
      errorCode: 6605,
      message: 'Refund quantity exceeds purchased or remaining quantity',
      httpStatus: HttpStatus.BAD_REQUEST,
    },
    PRODUCT_INACTIVE: {
      errorCode: 6606,
      message: 'Product is not available for sale',
      httpStatus: HttpStatus.BAD_REQUEST,
    },
    HAS_REFUNDS: {
      errorCode: 6607,
      message: 'Cannot cancel invoice with existing refunds',
      httpStatus: HttpStatus.CONFLICT,
    },
    PRICE_MISMATCH: {
      errorCode: 6608,
      message: 'Unit price does not match product price for selected tier',
      httpStatus: HttpStatus.BAD_REQUEST,
    },
  },
  PRICE_TIER: {
    NOT_FOUND: {
      errorCode: 6700,
      message: 'Price tier not found',
      httpStatus: HttpStatus.NOT_FOUND,
    },
    SYSTEM_PROTECTED: {
      errorCode: 6701,
      message: 'System price tier cannot be modified this way',
      httpStatus: HttpStatus.CONFLICT,
    },
    LIMIT_REACHED: {
      errorCode: 6702,
      message: 'Maximum custom price tiers reached',
      httpStatus: HttpStatus.CONFLICT,
    },
    CODE_EXISTS: {
      errorCode: 6703,
      message: 'Price tier code already exists',
      httpStatus: HttpStatus.CONFLICT,
    },
    INVALID_FOR_TENANT: {
      errorCode: 6704,
      message: 'Price tier is not active for this store',
      httpStatus: HttpStatus.BAD_REQUEST,
    },
    INVALID_AMOUNT: {
      errorCode: 6705,
      message: 'Invalid price amount',
      httpStatus: HttpStatus.BAD_REQUEST,
    },
    MISSING_SYSTEM_PRICE: {
      errorCode: 6706,
      message: 'Missing required system tier price',
      httpStatus: HttpStatus.BAD_REQUEST,
    },
  },
  RBAC: {
    ROLE_NOT_FOUND: {
      errorCode: 5000,
      message: 'Role not found',
      httpStatus: HttpStatus.NOT_FOUND,
    },
    INVALID_PERMISSIONS: {
      errorCode: 5001,
      message: 'One or more permission codes are invalid',
      httpStatus: HttpStatus.BAD_REQUEST,
    },
    SYSTEM_ROLE_PROTECTED: {
      errorCode: 5002,
      message: 'System role cannot be modified',
      httpStatus: HttpStatus.CONFLICT,
    },
    ROLE_CODE_EXISTS: {
      errorCode: 5003,
      message: 'Role code already exists in this tenant',
      httpStatus: HttpStatus.CONFLICT,
    },
    ROLE_IN_USE: {
      errorCode: 5004,
      message: 'Role is assigned to users and cannot be deleted',
      httpStatus: HttpStatus.CONFLICT,
    },
    ROLE_CODE_RESERVED: {
      errorCode: 5005,
      message: 'Role code is reserved for system roles',
      httpStatus: HttpStatus.BAD_REQUEST,
    },
  },
  SETTINGS: {
    NOT_FOUND: {
      errorCode: 7000,
      message: 'Setting not found',
      httpStatus: HttpStatus.NOT_FOUND,
    },
    INVALID_VALUE: {
      errorCode: 7001,
      message: 'Invalid setting value',
      httpStatus: HttpStatus.BAD_REQUEST,
    },
    FEATURE_FLAG_NOT_FOUND: {
      errorCode: 7002,
      message: 'Feature flag not found',
      httpStatus: HttpStatus.NOT_FOUND,
    },
  },
  REPORT: {
    INVALID_TYPE: {
      errorCode: 7100,
      message: 'Invalid report type',
      httpStatus: HttpStatus.BAD_REQUEST,
    },
  },
  IMPORT: {
    EMPTY_FILE: {
      errorCode: 6800,
      message: 'Import file is empty',
      httpStatus: HttpStatus.BAD_REQUEST,
    },
    INVALID_FORMAT: {
      errorCode: 6801,
      message: 'Invalid CSV format or headers',
      httpStatus: HttpStatus.BAD_REQUEST,
    },
    PREVIEW_EXPIRED: {
      errorCode: 6802,
      message: 'Import preview expired, please upload again',
      httpStatus: HttpStatus.BAD_REQUEST,
    },
    ROW_LIMIT_EXCEEDED: {
      errorCode: 6803,
      message: 'Import row limit exceeded',
      httpStatus: HttpStatus.BAD_REQUEST,
    },
    INVALID_FILE_TYPE: {
      errorCode: 6804,
      message: 'Only CSV (.csv) and Excel (.xlsx) files are supported',
      httpStatus: HttpStatus.BAD_REQUEST,
    },
  },
  NOTIFICATION: {
    NOT_FOUND: {
      errorCode: 7200,
      message: 'Notification not found',
      httpStatus: HttpStatus.NOT_FOUND,
    },
  },
  AUDIT: {
    NOT_FOUND: {
      errorCode: 7300,
      message: 'Audit log not found',
      httpStatus: HttpStatus.NOT_FOUND,
    },
  },
} as const satisfies Record<string, Record<string, ErrorDefinition>>;
