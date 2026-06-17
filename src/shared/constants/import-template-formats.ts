import type { ExcelColumnFormat } from '../utils/excel.util';

export const SUPPLIER_IMPORT_COLUMN_FORMATS: Record<string, ExcelColumnFormat> = {
  name: 'text',
  phone: 'text',
  email: 'text',
  address: 'text',
  tax_code: 'text',
  status: 'text',
};

export const PO_IMPORT_COLUMN_FORMATS: Record<string, ExcelColumnFormat> = {
  po_group: 'text',
  supplier_phone: 'text',
  product_sku: 'text',
  quantity: 'number',
  cost_price: 'number',
  expected_date: 'text',
};

export function getProductImportColumnFormats(
  headers: string[],
): Record<string, ExcelColumnFormat> {
  const formats: Record<string, ExcelColumnFormat> = {
    sku: 'text',
    name: 'text',
    barcode: 'text',
    category_name: 'text',
    cost_price: 'number',
    minimum_stock: 'number',
    status: 'text',
    image_url: 'text',
  };

  for (const header of headers) {
    if (header.startsWith('price_')) {
      formats[header] = 'number';
    }
  }

  return formats;
}
