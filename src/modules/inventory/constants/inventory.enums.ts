export enum InventoryTransactionType {
  IN = 'IN',
  OUT = 'OUT',
  ADJUST = 'ADJUST',
}

export enum InventoryReferenceType {
  PURCHASE_ORDER = 'PURCHASE_ORDER',
  INVOICE = 'INVOICE',
  MANUAL = 'MANUAL',
}

export enum AdjustmentReason {
  DAMAGE = 'DAMAGE',
  LOSS = 'LOSS',
  EXPIRED = 'EXPIRED',
  CORRECTION = 'CORRECTION',
}
