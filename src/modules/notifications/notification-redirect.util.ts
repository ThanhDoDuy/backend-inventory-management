export function buildNotificationRedirectUrl(
  type: string,
  payload: Record<string, unknown>,
): string {
  switch (type) {
    case 'LOW_STOCK': {
      const productId = payload.productId ?? payload.product_id;
      return productId ? `/dashboard/products/${String(productId)}` : '';
    }
    case 'PO_RECEIVED': {
      const poId = payload.purchaseOrderId ?? payload.purchase_order_id ?? payload.poId;
      return poId ? `/dashboard/purchase-orders/${String(poId)}` : '';
    }
    case 'INVOICE_PAID': {
      const invoiceId = payload.invoiceId ?? payload.invoice_id;
      return invoiceId ? `/dashboard/invoices/${String(invoiceId)}` : '';
    }
    default:
      return '';
  }
}
