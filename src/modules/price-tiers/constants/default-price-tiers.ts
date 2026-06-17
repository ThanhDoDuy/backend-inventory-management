export const SYSTEM_PRICE_TIER_CODES = ['WHOLESALE', 'VIP', 'RETAIL'] as const;

export type SystemPriceTierCode = (typeof SYSTEM_PRICE_TIER_CODES)[number];

export const DEFAULT_PRICE_TIERS = [
  { code: 'WHOLESALE', label: 'Giá sỉ', sort_order: 1 },
  { code: 'VIP', label: 'Giá VIP', sort_order: 2 },
  { code: 'RETAIL', label: 'Giá lẻ', sort_order: 3 },
] as const;

export const MAX_CUSTOM_PRICE_TIERS = 1;

export const RETAIL_TIER_CODE = 'RETAIL';
