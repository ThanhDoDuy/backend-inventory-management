export const PO_IMPORT_PREVIEW_TTL_SECONDS = 900;

export const PO_IMPORT_MAX_ROWS = 5_000;

export const PO_IMPORT_MAX_FILE_BYTES = 2 * 1024 * 1024;

export const PO_IMPORT_HEADERS = [
  'po_group',
  'supplier_phone',
  'product_sku',
  'quantity',
  'cost_price',
  'expected_date',
] as const;
