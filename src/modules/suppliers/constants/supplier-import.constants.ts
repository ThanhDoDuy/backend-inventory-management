export const SUPPLIER_IMPORT_PREVIEW_TTL_SECONDS = 900;

export const SUPPLIER_IMPORT_MAX_ROWS = 5_000;

export const SUPPLIER_IMPORT_MAX_FILE_BYTES = 2 * 1024 * 1024;

export type SupplierImportMode = 'create_only' | 'upsert';

export const SUPPLIER_IMPORT_HEADERS = [
  'name',
  'phone',
  'email',
  'address',
  'tax_code',
  'status',
] as const;
