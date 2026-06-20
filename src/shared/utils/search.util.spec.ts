import {
  buildSearchText,
  normalizeSearchText,
  productSearchText,
  categorySearchText,
  supplierSearchText,
  customerSearchText,
  userSearchText,
} from './search.util';

describe('search.util', () => {
  describe('normalizeSearchText', () => {
    it('lowercases latin text', () => {
      expect(normalizeSearchText('ABC')).toBe('abc');
    });

    it('strips Vietnamese diacritics', () => {
      expect(normalizeSearchText('Mặt nạ')).toBe('mat na');
      expect(normalizeSearchText('Điện thoại')).toBe('dien thoai');
    });

    it('matches partial search without caring about case', () => {
      const normalized = normalizeSearchText('Mặt nạ');
      expect(normalized.includes(normalizeSearchText('m'))).toBe(true);
      expect(normalized.includes(normalizeSearchText('mat'))).toBe(true);
      expect(normalized.includes(normalizeSearchText('MAT'))).toBe(true);
    });
  });

  describe('entity search text builders', () => {
    it('builds product search text from name sku barcode', () => {
      expect(productSearchText('Mặt nạ', 'SKU-01', '893xxx')).toBe(
        'mat na sku-01 893xxx',
      );
    });

    it('builds category search text', () => {
      expect(categorySearchText('Chăm sóc da', 'Mặt nạ')).toBe(
        'cham soc da mat na',
      );
    });

    it('builds supplier search text', () => {
      expect(
        supplierSearchText('Công ty ABC', '0901234567', 'A@B.COM'),
      ).toContain('cong ty abc');
    });

    it('builds customer search text', () => {
      expect(
        customerSearchText('Nguyễn Văn A', '0909', undefined, '0123456789'),
      ).toContain('nguyen van a');
    });

    it('builds user search text', () => {
      expect(userSearchText('AdminUser', 'Admin@Example.com')).toBe(
        'adminuser admin@example.com',
      );
    });

    it('joins multiple parts in buildSearchText', () => {
      expect(buildSearchText('  Mặt ', '', 'nạ  ')).toBe('mat na');
    });
  });
});
