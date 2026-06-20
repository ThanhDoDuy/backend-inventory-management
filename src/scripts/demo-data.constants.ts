import { CustomerType, PaymentMethod } from '../shared/constants/business.enums';
import { AdjustmentReason } from '../modules/inventory/constants/inventory.enums';

export const DEMO_ACCOUNT = {
  tenantName: 'POOS Demo Store',
  username: 'admin',
  email: 'demo@possimplify.com',
  password: 'Demo12345!',
} as const;

export const DEMO_TENANT_PROFILE = {
  address: '123 Nguyễn Huệ',
  city: 'Quận 1',
  state: 'TP. Hồ Chí Minh',
  phone: '02838222222',
} as const;

export const DEMO_EXTRA_USERS = [
  {
    username: 'manager',
    email: 'manager@possimplify.com',
    password: 'Demo12345!',
    roleCode: 'MANAGER',
  },
  {
    username: 'staff',
    email: 'staff@possimplify.com',
    password: 'Demo12345!',
    roleCode: 'STAFF',
  },
] as const;

export const DEMO_CATEGORIES = [
  {
    key: 'skincare',
    name: 'Chăm sóc da',
    description: 'Mặt nạ, sữa rửa mặt, kem dưỡng',
  },
  {
    key: 'makeup',
    name: 'Trang điểm',
    description: 'Son môi, phấn nền, mascara',
  },
  {
    key: 'electronics',
    name: 'Điện tử',
    description: 'Chuột, bàn phím, tai nghe',
  },
  {
    key: 'beverages',
    name: 'Đồ uống',
    description: 'Nước suối, cà phê, trà',
  },
] as const;

export const DEMO_PRODUCTS = [
  {
    key: 'mat-na',
    sku: 'SKU-MN001',
    name: 'Mặt nạ dưỡng ẩm',
    categoryKey: 'skincare',
    cost_price: 15000,
    selling_price: 35000,
    minimum_stock: 20,
    barcode: '8934567890012',
  },
  {
    key: 'sua-rua-mat',
    sku: 'SKU-SRM002',
    name: 'Sữa rửa mặt Cerave',
    categoryKey: 'skincare',
    cost_price: 180000,
    selling_price: 320000,
    minimum_stock: 10,
    barcode: '8934567890029',
  },
  {
    key: 'kem-chong-nang',
    sku: 'SKU-KCN003',
    name: 'Kem chống nắng SPF50',
    categoryKey: 'skincare',
    cost_price: 95000,
    selling_price: 185000,
    minimum_stock: 8,
    barcode: '8934567890036',
  },
  {
    key: 'son-moi',
    sku: 'SKU-SM001',
    name: 'Son môi đỏ ruby',
    categoryKey: 'makeup',
    cost_price: 85000,
    selling_price: 165000,
    minimum_stock: 5,
    barcode: '8934567890043',
  },
  {
    key: 'phan-nen',
    sku: 'SKU-PN002',
    name: 'Phấn nền Maybelline',
    categoryKey: 'makeup',
    cost_price: 120000,
    selling_price: 220000,
    minimum_stock: 6,
    barcode: '8934567890050',
  },
  {
    key: 'chuot-logitech',
    sku: 'SKU-EL001',
    name: 'Chuột không dây Logitech M331',
    categoryKey: 'electronics',
    cost_price: 250000,
    selling_price: 390000,
    minimum_stock: 5,
    barcode: '8934567890067',
  },
  {
    key: 'ban-phim',
    sku: 'SKU-EL002',
    name: 'Bàn phím cơ Keychron K2',
    categoryKey: 'electronics',
    cost_price: 1200000,
    selling_price: 1890000,
    minimum_stock: 3,
    barcode: '8934567890074',
  },
  {
    key: 'tai-nghe',
    sku: 'SKU-EL003',
    name: 'Tai nghe Bluetooth Sony WH-CH520',
    categoryKey: 'electronics',
    cost_price: 850000,
    selling_price: 1290000,
    minimum_stock: 4,
    barcode: '8934567890081',
  },
  {
    key: 'nuoc-suoi',
    sku: 'SKU-BV001',
    name: 'Nước suối Lavie 500ml',
    categoryKey: 'beverages',
    cost_price: 3000,
    selling_price: 6000,
    minimum_stock: 50,
    barcode: '8934567890098',
  },
  {
    key: 'ca-phe',
    sku: 'SKU-BV002',
    name: 'Cà phê hòa tan G7 3in1',
    categoryKey: 'beverages',
    cost_price: 4500,
    selling_price: 8000,
    minimum_stock: 30,
    barcode: '8934567890104',
  },
  {
    key: 'tra-xanh',
    sku: 'SKU-BV003',
    name: 'Trà xanh 0 độ',
    categoryKey: 'beverages',
    cost_price: 5000,
    selling_price: 9000,
    minimum_stock: 24,
    barcode: '8934567890111',
  },
] as const;

export const DEMO_SUPPLIERS = [
  {
    key: 'beauty',
    name: 'Công ty Mỹ phẩm Hoa Lan',
    phone: '0909123456',
    email: 'hoalan@supplier.vn',
    address: '45 Lê Lợi, Q1, TP.HCM',
    tax_code: '0312345678',
  },
  {
    key: 'tech',
    name: 'Nhà phân phối Tech Việt',
    phone: '0909234567',
    email: 'sales@techviet.vn',
    address: '88 Cách Mạng Tháng 8, Q3, TP.HCM',
    tax_code: '0313456789',
  },
  {
    key: 'beverage',
    name: 'Nhà cung cấp đồ uống ABC',
    phone: '0909345678',
    email: 'order@abc-beverage.vn',
    address: '12 Võ Văn Tần, Q3, TP.HCM',
    tax_code: '0314567890',
  },
] as const;

export const DEMO_CUSTOMERS = [
  {
    key: 'company',
    customer_type: CustomerType.COMPANY,
    name: 'Công ty TNHH Beauty Plus',
    phone: '02839393939',
    email: 'mua-hang@beautyplus.vn',
    address: '200 Nam Kỳ Khởi Nghĩa, Q3, TP.HCM',
    tax_code: '0312345678',
    contact_person: 'Trần Thị Bích',
  },
  {
    key: 'group',
    customer_type: CustomerType.GROUP,
    name: 'Nhóm mua sỉ Quận 1',
    phone: '0922222222',
    email: 'group-q1@example.com',
    address: '5 Lê Duẩn, Q1, TP.HCM',
    contact_person: 'Lê Văn Cường',
  },
] as const;

export interface DemoPoPlan {
  key: string;
  supplierKey: string;
  status: 'RECEIVED' | 'PARTIAL_RECEIVED' | 'APPROVED' | 'DRAFT';
  items: Array<{
    productKey: string;
    quantity: number;
    costPrice?: number;
  }>;
  partialReceive?: Array<{
    productKey: string;
    receivedQuantity: number;
  }>;
}

export const DEMO_PURCHASE_ORDERS: DemoPoPlan[] = [
  {
    key: 'po-beauty',
    supplierKey: 'beauty',
    status: 'RECEIVED',
    items: [
      { productKey: 'mat-na', quantity: 8 },
      { productKey: 'sua-rua-mat', quantity: 25 },
      { productKey: 'kem-chong-nang', quantity: 20 },
      { productKey: 'son-moi', quantity: 15 },
      { productKey: 'phan-nen', quantity: 12 },
    ],
  },
  {
    key: 'po-tech',
    supplierKey: 'tech',
    status: 'PARTIAL_RECEIVED',
    items: [
      { productKey: 'chuot-logitech', quantity: 20 },
      { productKey: 'ban-phim', quantity: 8 },
      { productKey: 'tai-nghe', quantity: 10 },
    ],
    partialReceive: [
      { productKey: 'chuot-logitech', receivedQuantity: 10 },
      { productKey: 'tai-nghe', receivedQuantity: 5 },
    ],
  },
  {
    key: 'po-beverage',
    supplierKey: 'beverage',
    status: 'DRAFT',
    items: [
      { productKey: 'nuoc-suoi', quantity: 200 },
      { productKey: 'ca-phe', quantity: 100 },
      { productKey: 'tra-xanh', quantity: 80 },
    ],
  },
];

export const DEMO_INVOICES = [
  {
    key: 'inv-walkin',
    customerKey: null as string | null,
    paymentMethod: PaymentMethod.CASH,
    items: [
      { productKey: 'mat-na', quantity: 2 },
      { productKey: 'son-moi', quantity: 1 },
    ],
  },
  {
    key: 'inv-company',
    customerKey: 'company',
    paymentMethod: PaymentMethod.BANK_TRANSFER,
    discountPercent: 5,
    items: [
      { productKey: 'sua-rua-mat', quantity: 3 },
      { productKey: 'kem-chong-nang', quantity: 2 },
      { productKey: 'phan-nen', quantity: 2 },
    ],
  },
  {
    key: 'inv-group',
    customerKey: 'group',
    paymentMethod: PaymentMethod.CARD,
    items: [
      { productKey: 'chuot-logitech', quantity: 5 },
      { productKey: 'tai-nghe', quantity: 2 },
    ],
  },
] as const;

export const DEMO_ADJUSTMENTS = [
  {
    productKey: 'mat-na',
    quantity: -1,
    reason: AdjustmentReason.DAMAGE,
    note: 'Hư hộp khi vận chuyển',
  },
];
