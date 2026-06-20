import { escapeRegex } from './regex.util';

/** Lowercase + strip Vietnamese diacritics for accent-insensitive search. */
export function normalizeSearchText(value: string): string {
  if (!value) {
    return '';
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function buildSearchText(
  ...parts: (string | null | undefined)[]
): string {
  return parts
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .map((part) => normalizeSearchText(part))
    .join(' ')
    .trim();
}

export function buildSearchTextFilter(
  search?: string,
): Record<string, unknown> | null {
  const normalized = normalizeSearchText(search ?? '');
  if (!normalized) {
    return null;
  }

  return { search_text: { $regex: escapeRegex(normalized) } };
}

export function applySearchTextFilter(
  filter: Record<string, unknown>,
  search?: string,
): void {
  const searchFilter = buildSearchTextFilter(search);
  if (searchFilter) {
    Object.assign(filter, searchFilter);
  }
}

export function productSearchText(
  name: string,
  sku: string,
  barcode?: string | null,
): string {
  return buildSearchText(name, sku, barcode ?? undefined);
}

export function categorySearchText(
  name: string,
  description?: string | null,
): string {
  return buildSearchText(name, description ?? undefined);
}

export function supplierSearchText(
  name: string,
  phone: string,
  email?: string | null,
  taxCode?: string | null,
  address?: string | null,
): string {
  return buildSearchText(name, phone, email ?? undefined, taxCode ?? undefined, address ?? undefined);
}

export function customerSearchText(
  name: string,
  phone: string,
  email?: string | null,
  taxCode?: string | null,
  contactPerson?: string | null,
): string {
  return buildSearchText(
    name,
    phone,
    email ?? undefined,
    taxCode ?? undefined,
    contactPerson ?? undefined,
  );
}

export function userSearchText(username: string, email: string): string {
  return buildSearchText(username, email);
}
