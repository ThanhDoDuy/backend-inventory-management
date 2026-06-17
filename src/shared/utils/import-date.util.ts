export function formatDateYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function excelSerialToDate(serial: number): Date {
  const utcDays = Math.floor(serial - 25569);
  return new Date(utcDays * 86400 * 1000);
}

/**
 * Normalize date values from CSV/Excel import into YYYY-MM-DD.
 * Returns null when empty, undefined when invalid.
 */
export function parseImportDate(raw: string | undefined): string | null | undefined {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const isoPrefix = trimmed.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (isoPrefix) {
    return isoPrefix[1];
  }

  const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }

  const numeric = Number(trimmed.replace(/,/g, ''));
  // Excel serial dates for 2000–2050 (~36526–55153), not plain amounts like 72000 VND
  if (Number.isFinite(numeric) && numeric >= 36_526 && numeric <= 55_153) {
    return formatDateYmd(excelSerialToDate(numeric));
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return formatDateYmd(parsed);
  }

  return undefined;
}
