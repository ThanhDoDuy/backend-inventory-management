import ExcelJS from 'exceljs';
import { formatDateYmd } from './import-date.util';

export type ExcelColumnFormat = 'text' | 'number';

export interface BuildExcelOptions {
  sheetName?: string;
  /** Column format by header name (case-insensitive). */
  columnFormats?: Record<string, ExcelColumnFormat>;
}

function applyCellFormat(
  cell: ExcelJS.Cell,
  format: ExcelColumnFormat,
  value: ExcelJS.CellValue,
): void {
  if (format === 'text') {
    cell.value = value === null || value === undefined ? '' : String(value);
    cell.numFmt = '@';
    return;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    cell.value = value;
  } else {
    const parsed = Number(String(value ?? '').replace(/,/g, ''));
    cell.value = Number.isFinite(parsed) ? parsed : value;
  }
  cell.numFmt = '#,##0';
}

function applyColumnFormats(
  sheet: ExcelJS.Worksheet,
  headers: string[],
  columnFormats: Record<string, ExcelColumnFormat>,
): void {
  const colByHeader = new Map(
    headers.map((header, index) => [header.toLowerCase(), index + 1]),
  );

  for (const [header, format] of Object.entries(columnFormats)) {
    const col = colByHeader.get(header.toLowerCase());
    if (!col) {
      continue;
    }

    for (let rowIndex = 2; rowIndex <= sheet.rowCount; rowIndex++) {
      const cell = sheet.getRow(rowIndex).getCell(col);
      applyCellFormat(cell, format, cell.value);
    }
  }
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return formatDateYmd(value);
  }
  if (typeof value === 'object') {
    if ('result' in value && value.result !== undefined && value.result !== null) {
      return String(value.result);
    }
    if ('text' in value && value.text !== undefined && value.text !== null) {
      return String(value.text);
    }
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text ?? '').join('');
    }
    if ('hyperlink' in value) {
      return String(value.text ?? value.hyperlink ?? '');
    }
  }
  return String(value);
}

export async function buildExcelBuffer(
  headers: string[],
  rows: unknown[][],
  options: BuildExcelOptions | string = {},
): Promise<Buffer> {
  const resolvedOptions: BuildExcelOptions =
    typeof options === 'string' ? { sheetName: options } : options;
  const sheetName = resolvedOptions.sheetName ?? 'Sheet1';

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(row);
  }

  if (resolvedOptions.columnFormats) {
    applyColumnFormats(sheet, headers, resolvedOptions.columnFormats);
  }

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: 'middle' };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function parseExcelToRows(buffer: Buffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(new Uint8Array(buffer) as never);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return [];
  }

  const rows: string[][] = [];
  sheet.eachRow((row) => {
    const maxCol = Math.max(row.cellCount, sheet.columnCount);
    const cells: string[] = [];
    for (let col = 1; col <= maxCol; col++) {
      cells.push(cellToString(row.getCell(col).value));
    }
    while (cells.length > 0 && cells[cells.length - 1].trim() === '') {
      cells.pop();
    }
    if (cells.some((cell) => cell.trim() !== '')) {
      rows.push(cells);
    }
  });

  return rows;
}
