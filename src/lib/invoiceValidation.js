const POSITIVE_TOTAL_STATUSES = new Set([
  'sent',
  'uploaded',
  'partially_paid',
  'paid',
  'overdue',
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
    'Invoice total must be greater than zero before it can be sent, uploaded, partially paid, paid, or overdue. Save it as a draft until the total is set.',
  );
  error.status = 400;
  error.code = 'INVOICE_TOTAL_REQUIRED';
  throw error;
}

export function validateInvoiceStatusTotal(invoice = {}) {
  requirePositiveInvoiceTotal(invoice.status, invoice.total);
  return invoice;
}
