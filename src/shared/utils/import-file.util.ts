import { extname } from 'path';
import { parseCsv } from './csv.util';
import { parseExcelToRows } from './excel.util';

export type ImportFileType = 'csv' | 'xlsx';

const CSV_EXTENSIONS = new Set(['.csv']);
const EXCEL_EXTENSIONS = new Set(['.xlsx']);

const CSV_MIME_TYPES = new Set(['text/csv', 'application/csv']);
const EXCEL_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export interface ImportFileMeta {
  originalname?: string;
  mimetype?: string;
}

export function resolveImportFileType(
  buffer: Buffer,
  meta?: ImportFileMeta,
): ImportFileType | null {
  const extension = meta?.originalname
    ? extname(meta.originalname).toLowerCase()
    : '';

  if (CSV_EXTENSIONS.has(extension)) {
    return 'csv';
  }
  if (EXCEL_EXTENSIONS.has(extension)) {
    return 'xlsx';
  }

  const mime = meta?.mimetype?.toLowerCase();
  if (mime && CSV_MIME_TYPES.has(mime)) {
    return 'csv';
  }
  if (mime && EXCEL_MIME_TYPES.has(mime)) {
    return 'xlsx';
  }

  if (buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
    return 'xlsx';
  }

  return null;
}

export async function parseImportFileToRows(
  buffer: Buffer,
  meta?: ImportFileMeta,
): Promise<string[][]> {
  const fileType = resolveImportFileType(buffer, meta);
  if (!fileType) {
    return [];
  }

  if (fileType === 'xlsx') {
    return parseExcelToRows(buffer);
  }

  const content = buffer.toString('utf-8').trim();
  if (!content) {
    return [];
  }
  return parseCsv(content);
}
