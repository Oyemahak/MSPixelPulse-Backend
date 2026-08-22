import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

const NAVY = rgb(0.055, 0.114, 0.216);
const BLUE = rgb(0.02, 0.408, 0.631);
const GREEN = rgb(0.063, 0.514, 0.302);
const INK = rgb(0.055, 0.078, 0.118);
const MUTED = rgb(0.37, 0.42, 0.49);
const BORDER = rgb(0.87, 0.89, 0.92);
const SURFACE = rgb(0.96, 0.97, 0.98);
const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0.015, 0.02, 0.025);

const LOGO_PATHS = [
  'M914 673L913 904L697 1040L483 904L483 546L560 588L560 858L697 948L836 857L836 641L348 359L348 861L270 861L270 222L483 345L483 186L697 63L913 186L913 255L836 296L836 231L697 152L559 229L559 369L562 392L914 597V673Z',
  'M1126 222V861H1048V359L865 465L843 456L784 420L1126 222Z',
];

function text(value) {
  return String(value ?? '').trim();
}

function formatMoney(value, currency = 'CAD') {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency', currency: text(currency) || 'CAD', minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date);
}

function wrappedLines(font, value, size, maxWidth, maxLines = 3) {
  const words = text(value).replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && current) lines.push(current);
  const source = words.join(' ');
  const rendered = lines.join(' ');
  if (rendered.length < source.length && lines.length) {
    let last = lines.at(-1);
    while (last && font.widthOfTextAtSize(`${last}...`, size) > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last}...`;
  }
  return lines.slice(0, maxLines);
}

function drawWrapped(page, font, value, { x, y, size = 8.5, color = INK, maxWidth, lineHeight = 11, maxLines = 3 }) {
  const lines = wrappedLines(font, value, size, maxWidth, maxLines);
  lines.forEach((line, index) => page.drawText(line, { x, y: y - index * lineHeight, size, font, color }));
  return y - Math.max(lines.length, 1) * lineHeight;
}

function label(page, font, value, x, y) {
  page.drawText(text(value).toUpperCase(), { x, y, size: 7, font, color: MUTED, characterSpacing: 0.8 });
}

function detailRow(page, fonts, left, right, y, width) {
  const { regular, medium } = fonts;
  label(page, medium, left.label, 48, y);
  drawWrapped(page, regular, left.value || '-', { x: 48, y: y - 12, size: 8.5, maxWidth: width, maxLines: 2 });
  label(page, medium, right.label, 320, y);
  drawWrapped(page, regular, right.value || '-', { x: 320, y: y - 12, size: 8.5, maxWidth: width, maxLines: 2 });
}

export async function generateReceiptPdf(receipt, { pageSize = 'LETTER' } = {}) {
  const document = await PDFDocument.create();
  const dimensions = String(pageSize).toUpperCase() === 'A4' ? [595.28, 841.89] : [612, 792];
  const page = document.addPage(dimensions);
  const { width, height } = page.getSize();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const medium = await document.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, medium };
  const right = width - 48;

  LOGO_PATHS.forEach((path) => page.drawSvgPath(path, { x: 45, y: height - 34, scale: 0.035, color: BLACK }));
  page.drawText('MSPixelPulse', { x: 91, y: height - 48, size: 15, font: medium, color: NAVY });
  page.drawText('Toronto, Ontario, Canada', { x: 91, y: height - 61, size: 7.5, font: regular, color: MUTED });

  const title = 'OFFICIAL PAYMENT RECEIPT';
  page.drawText(title, { x: right - medium.widthOfTextAtSize(title, 15), y: height - 43, size: 15, font: medium, color: NAVY });
  page.drawText(text(receipt.receiptNumber), { x: right - regular.widthOfTextAtSize(text(receipt.receiptNumber), 8.5), y: height - 58, size: 8.5, font: regular, color: MUTED });
  page.drawLine({ start: { x: 48, y: height - 78 }, end: { x: right, y: height - 78 }, thickness: 1.2, color: NAVY });

  const statusText = Number(receipt.balanceRemainingSnapshot || 0) <= 0.005 ? 'PAID IN FULL' : 'PAYMENT RECEIVED';
  const statusWidth = medium.widthOfTextAtSize(statusText, 8) + 18;
  page.drawRectangle({ x: right - statusWidth, y: height - 102, width: statusWidth, height: 20, color: rgb(0.91, 0.97, 0.94), borderColor: rgb(0.65, 0.86, 0.74), borderWidth: 0.7 });
  page.drawText(statusText, { x: right - statusWidth + 9, y: height - 95.5, size: 8, font: medium, color: GREEN });

  const partyTop = height - 118;
  const columnWidth = (width - 112) / 2;
  label(page, medium, 'From', 48, partyTop);
  drawWrapped(page, medium, text(receipt.senderSnapshot?.businessName) || 'MSPixelPulse', { x: 48, y: partyTop - 17, size: 10, maxWidth: columnWidth, lineHeight: 11, maxLines: 2 });
  drawWrapped(page, regular, [receipt.senderSnapshot?.address, receipt.senderSnapshot?.email, receipt.senderSnapshot?.phone, receipt.senderSnapshot?.website].filter(Boolean).join(' | '), { x: 48, y: partyTop - 42, size: 8, maxWidth: columnWidth, lineHeight: 10, maxLines: 3, color: MUTED });
  label(page, medium, 'Received from', 320, partyTop);
  drawWrapped(page, medium, text(receipt.clientSnapshot?.businessName || receipt.clientSnapshot?.contactName) || 'Client', { x: 320, y: partyTop - 17, size: 10, maxWidth: columnWidth, lineHeight: 11, maxLines: 2 });
  drawWrapped(page, regular, [receipt.clientSnapshot?.contactName, receipt.clientSnapshot?.address, receipt.clientSnapshot?.email, receipt.clientSnapshot?.phone].filter(Boolean).join(' | '), { x: 320, y: partyTop - 42, size: 8, maxWidth: columnWidth, lineHeight: 10, maxLines: 3, color: MUTED });

  let y = height - 205;
  page.drawLine({ start: { x: 48, y }, end: { x: right, y }, thickness: 0.7, color: BORDER });
  y -= 22;
  const invoiceNumbers = Array.isArray(receipt.invoiceNumbers) && receipt.invoiceNumbers.length
    ? receipt.invoiceNumbers
    : [receipt.invoiceNumber].filter(Boolean);
  const paymentIds = Array.isArray(receipt.paymentIds) && receipt.paymentIds.length
    ? receipt.paymentIds
    : [receipt.paymentId].filter(Boolean);
  const relatedInvoiceLabel = invoiceNumbers.length > 1 ? 'Related invoices' : 'Related invoice';
  const paymentIdLabel = paymentIds.length > 1 ? 'Payment IDs' : 'Payment ID';
  detailRow(
    page,
    fonts,
    { label: 'Receipt date', value: formatDate(receipt.receiptDate) },
    receipt.hidePaymentMethod
      ? { label: relatedInvoiceLabel, value: invoiceNumbers.join(', ') }
      : { label: 'Payment date', value: formatDate(receipt.paymentDate) },
    y,
    columnWidth,
  );
  y -= 42;
  detailRow(
    page,
    fonts,
    receipt.hidePaymentMethod
      ? { label: paymentIdLabel, value: paymentIds.join(', ') }
      : { label: 'Payment method', value: receipt.method },
    receipt.hidePaymentMethod
      ? { label: 'Currency', value: receipt.currency }
      : { label: 'Payment reference', value: receipt.paymentReference || '-' },
    y,
    columnWidth,
  );
  y -= 42;
  detailRow(
    page,
    fonts,
    receipt.hidePaymentMethod
      ? { label: 'Project', value: receipt.projectTitleSnapshot }
      : { label: relatedInvoiceLabel, value: invoiceNumbers.join(', ') },
    receipt.hidePaymentMethod
      ? { label: 'Transactions recorded', value: String(paymentIds.length) }
      : { label: paymentIdLabel, value: paymentIds.join(', ') },
    y,
    columnWidth,
  );
  if (!receipt.hidePaymentMethod) {
    y -= 42;
    detailRow(page, fonts, { label: 'Project', value: receipt.projectTitleSnapshot }, { label: 'Currency', value: receipt.currency }, y, columnWidth);
  }
  y -= 45;
  label(page, medium, 'Service description', 48, y);
  drawWrapped(page, regular, receipt.serviceDescriptionSnapshot || 'Professional web design and digital services', { x: 48, y: y - 13, size: 8.5, maxWidth: width - 96, maxLines: 2 });

  y -= 52;
  page.drawRectangle({ x: 48, y: y - 63, width: width - 96, height: 68, color: NAVY });
  page.drawText('AMOUNT RECEIVED', { x: 64, y: y - 17, size: 8, font: medium, color: rgb(0.72, 0.82, 0.94), characterSpacing: 0.8 });
  const amount = formatMoney(receipt.paymentAmountSnapshot || receipt.amount, receipt.currency);
  page.drawText(amount, { x: 64, y: y - 47, size: 24, font: medium, color: WHITE });
  page.drawText(statusText, { x: right - medium.widthOfTextAtSize(statusText, 9) - 16, y: y - 37, size: 9, font: medium, color: rgb(0.61, 0.89, 0.73) });

  y -= 91;
  const consolidated = receipt.receiptType === 'consolidated' || invoiceNumbers.length > 1 || paymentIds.length > 1;
  const summaryRows = [
    [consolidated ? 'Invoices total' : 'Invoice total', receipt.invoiceTotalSnapshot],
    ['Previously paid', receipt.previouslyPaidSnapshot],
    [consolidated ? 'Amount received' : 'This payment', receipt.paymentAmountSnapshot],
    [consolidated ? 'Total received' : 'Total paid to date', receipt.totalPaidSnapshot],
    ['Remaining balance', receipt.balanceRemainingSnapshot],
  ];
  page.drawRectangle({ x: 48, y: y - 103, width: width - 96, height: 109, color: SURFACE, borderColor: BORDER, borderWidth: 0.7 });
  summaryRows.forEach(([rowLabel, value], index) => {
    const rowY = y - 16 - index * 20;
    page.drawText(rowLabel, { x: 62, y: rowY, size: 8.5, font: index >= 3 ? medium : regular, color: index === 4 ? NAVY : INK });
    const formatted = formatMoney(value, receipt.currency);
    page.drawText(formatted, { x: right - 14 - (index >= 3 ? medium : regular).widthOfTextAtSize(formatted, 8.5), y: rowY, size: 8.5, font: index >= 3 ? medium : regular, color: index === 4 ? NAVY : INK });
  });

  y -= 129;
  if (receipt.taxApplied) {
    const taxText = `${receipt.taxLabel || 'Tax'} ${Number(receipt.taxRate || 0)}% included: ${formatMoney(receipt.taxAmount, receipt.currency)}${receipt.taxRegistrationNumber ? ` | Registration: ${receipt.taxRegistrationNumber}` : ''}`;
    drawWrapped(page, regular, taxText, { x: 48, y, size: 7.5, maxWidth: width - 96, maxLines: 2, color: MUTED });
    y -= 26;
  }
  drawWrapped(page, regular, 'This receipt confirms payment received by MSPixelPulse for the services described above.', { x: 48, y, size: 8, maxWidth: width - 96, maxLines: 2, color: MUTED });

  const footerY = 34;
  page.drawLine({ start: { x: 48, y: footerY + 18 }, end: { x: right, y: footerY + 18 }, thickness: 0.6, color: BORDER });
  const footerContact = [receipt.senderSnapshot?.website || 'mspixelpulse.com', receipt.senderSnapshot?.email].filter(Boolean).join(' | ');
  page.drawText(footerContact, { x: 48, y: footerY, size: 7, font: regular, color: MUTED });
  const footerRight = `${receipt.receiptNumber} | ${formatDate(receipt.issuedAt)} | Page 1 of 1`;
  page.drawText(footerRight, { x: right - regular.widthOfTextAtSize(footerRight, 7), y: footerY, size: 7, font: regular, color: MUTED });

  if (receipt.status === 'void') {
    const voidText = 'VOID';
    page.drawText(voidText, { x: width / 2 - 92, y: height / 2 - 10, size: 72, font: medium, color: rgb(0.82, 0.15, 0.15), opacity: 0.16, rotate: degrees(24) });
    drawWrapped(page, medium, `VOID: ${receipt.voidReason || 'Receipt voided by Administrator'}`, { x: 48, y: 68, size: 8, maxWidth: width - 96, maxLines: 2, color: rgb(0.65, 0.1, 0.1) });
  }

  document.setTitle(`Receipt ${receipt.receiptNumber}`);
  document.setAuthor('MSPixelPulse');
  document.setSubject('Official payment receipt');
  return Buffer.from(await document.save());
}

export const receiptPdfInternals = { formatDate, formatMoney, wrappedLines };
