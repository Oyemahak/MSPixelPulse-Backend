const POSITIVE_TOTAL_STATUSES = new Set([
  'sent',
  'uploaded',
  'partially_paid',
  'paid',
  'overdue',
  'cancelled',
  'archived',
]);

export function requirePositiveInvoiceTotal(status, total) {
  const amount = Number(total || 0);
  if (
    !POSITIVE_TOTAL_STATUSES.has(String(status || '')) ||
    (Number.isFinite(amount) && amount > 0)
  ) {
    return;
  }

  const error = new Error(
    'Invoice total must be greater than zero before it can leave draft status. Only an explicit draft may have a zero total.',
  );
  error.status = 400;
  error.code = 'INVOICE_TOTAL_REQUIRED';
  throw error;
}

export function validateInvoiceStatusTotal(invoice = {}) {
  requirePositiveInvoiceTotal(invoice.status, invoice.total);
  return invoice;
}
