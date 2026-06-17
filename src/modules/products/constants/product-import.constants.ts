export const CATEGORY_IMPORT_DESCRIPTION = 'Import from data';

export const PRODUCT_IMPORT_PREVIEW_TTL_SECONDS = 900;

export const PRODUCT_IMPORT_MAX_ROWS = 5_000;

export const PRODUCT_IMPORT_MAX_FILE_BYTES = 2 * 1024 * 1024;

export type ProductImportMode = 'create_only' | 'upsert';
