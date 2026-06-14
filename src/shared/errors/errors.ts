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
  },
  TENANT: {
    LIMIT_REACHED: {
      errorCode: 4000,
      message: 'Platform capacity reached',
      httpStatus: HttpStatus.CONFLICT,
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
} as const satisfies Record<string, Record<string, ErrorDefinition>>;
