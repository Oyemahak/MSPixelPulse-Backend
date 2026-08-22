import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const PAGE_SIZES = {
  LETTER: [612, 792],
  A4: [595.28, 841.89],
};

const BLACK = rgb(0.015, 0.02, 0.025);
const NAVY = rgb(0.055, 0.114, 0.216);
const BLUE = rgb(0.02, 0.408, 0.631);
const GREEN = rgb(0.063, 0.514, 0.302);
const INK = rgb(0.055, 0.078, 0.118);
const MUTED = rgb(0.37, 0.42, 0.49);
const BORDER = rgb(0.87, 0.89, 0.92);
const SURFACE = rgb(0.96, 0.97, 0.98);
const WHITE = rgb(1, 1, 1);

const LOGO_PATHS = [
  'M914 673L913 904L697 1040L483 904L483 546L560 588L560 858L697 948L836 857L836 641L348 359L348 861L270 861L270 222L483 345L483 186L697 63L913 186L913 255L836 296L836 231L697 152L559 229L559 369L562 392L914 597V673Z',
  'M1126 222V861H1048V359L865 465L843 456L784 420L1126 222Z',
];

function text(value) {
  return String(value ?? '').trim();
}

function formatMoney(value, currency = 'CAD') {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: text(currency) || 'CAD',
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  }).format(date);
}

function wrappedLines(font, value, size, maxWidth, maxLines = 4) {
  const words = text(value).replace(/\s+/g, ' ').split(' ').filter(Boolean);
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
    if (lines.length >= maxLines) break;
  }
  if (lines.length < maxLines && current) lines.push(current);
  return lines.slice(0, maxLines);
}

function drawWrapped(page, font, value, { x, y, size = 8.5, color = INK, maxWidth, lineHeight = 11, maxLines = 4 }) {
  const lines = wrappedLines(font, value, size, maxWidth, maxLines);
  lines.forEach((line, index) => page.drawText(line, { x, y: y - index * lineHeight, size, font, color }));
  return lines.length;
}

function drawRight(page, font, value, right, y, { size = 8.5, color = INK } = {}) {
  const output = text(value);
  page.drawText(output, { x: right - font.widthOfTextAtSize(output, size), y, size, font, color });
}

function label(page, font, value, x, y) {
  page.drawText(text(value).toUpperCase(), { x, y, size: 7, font, color: MUTED, characterSpacing: 0.8 });
}

export async function generateInvoicePdf(invoice, { pageSize = 'LETTER' } = {}) {
  const document = await PDFDocument.create();
  const dimensions = PAGE_SIZES[String(pageSize || invoice.pageSize).toUpperCase()] || PAGE_SIZES.LETTER;
  const page = document.addPage(dimensions);
  const { width, height } = page.getSize();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const medium = await document.embedFont(StandardFonts.HelveticaBold);
  const right = width - 48;

  LOGO_PATHS.forEach((path) => page.drawSvgPath(path, { x: 45, y: height - 34, scale: 0.035, color: BLACK }));
  page.drawText(text(invoice.sender?.businessName) || 'MSPixelPulse', { x: 91, y: height - 48, size: 15, font: medium, color: NAVY });
  page.drawText('Toronto, Ontario, Canada', { x: 91, y: height - 61, size: 7.5, font: regular, color: MUTED });
  drawRight(page, medium, 'INVOICE', right, height - 43, { size: 17, color: NAVY });
  drawRight(page, regular, invoice.invoiceNumber || 'Invoice', right, height - 59, { size: 8.5, color: MUTED });
  page.drawLine({ start: { x: 48, y: height - 78 }, end: { x: right, y: height - 78 }, thickness: 1.2, color: NAVY });

  const status = text(invoice.status || 'draft').replaceAll('_', ' ').toUpperCase();
  const statusColor = ['paid', 'partially_paid'].includes(invoice.status) ? GREEN : BLUE;
  const statusWidth = medium.widthOfTextAtSize(status, 8) + 18;
  page.drawRectangle({ x: right - statusWidth, y: height - 102, width: statusWidth, height: 20, color: SURFACE, borderColor: BORDER, borderWidth: 0.7 });
  page.drawText(status, { x: right - statusWidth + 9, y: height - 95.5, size: 8, font: medium, color: statusColor });

  const partyTop = height - 118;
  const columnWidth = (width - 112) / 2;
  label(page, medium, 'From', 48, partyTop);
  drawWrapped(page, medium, invoice.sender?.businessName || 'MSPixelPulse', { x: 48, y: partyTop - 17, size: 10, maxWidth: columnWidth, maxLines: 2 });
  drawWrapped(page, regular, [invoice.sender?.address, invoice.sender?.email, invoice.sender?.phone, invoice.sender?.website].filter(Boolean).join(' | '), { x: 48, y: partyTop - 42, size: 8, maxWidth: columnWidth, lineHeight: 10, maxLines: 3, color: MUTED });
  label(page, medium, 'Bill to', 320, partyTop);
  drawWrapped(page, medium, invoice.clientDetails?.businessName || invoice.clientDetails?.contactName || 'Client', { x: 320, y: partyTop - 17, size: 10, maxWidth: columnWidth, maxLines: 2 });
  drawWrapped(page, regular, [invoice.clientDetails?.contactName, invoice.clientDetails?.address, invoice.clientDetails?.email, invoice.clientDetails?.phone].filter(Boolean).join(' | '), { x: 320, y: partyTop - 42, size: 8, maxWidth: columnWidth, lineHeight: 10, maxLines: 3, color: MUTED });

  const metaY = height - 220;
  page.drawRectangle({ x: 48, y: metaY - 42, width: width - 96, height: 54, color: SURFACE, borderColor: BORDER, borderWidth: 0.7 });
  const meta = [
    ['Issue date', formatDate(invoice.issueDate)],
    ['Due date', formatDate(invoice.dueDate) || 'Not specified'],
    ['Project', invoice.projectTitle || invoice.title],
    ['Currency', invoice.currency || 'CAD'],
  ];
  const metaWidth = (width - 96) / 4;
  meta.forEach(([key, value], index) => {
    const x = 58 + index * metaWidth;
    label(page, medium, key, x, metaY - 3);
    drawWrapped(page, regular, value || '-', { x, y: metaY - 19, size: 8, maxWidth: metaWidth - 16, maxLines: 2 });
  });

  let y = metaY - 70;
  page.drawRectangle({ x: 48, y: y - 23, width: width - 96, height: 27, color: NAVY });
  page.drawText('DESCRIPTION', { x: 60, y: y - 13, size: 7, font: medium, color: WHITE });
  drawRight(page, medium, 'QTY', right - 150, y - 13, { size: 7, color: WHITE });
  drawRight(page, medium, 'RATE', right - 75, y - 13, { size: 7, color: WHITE });
  drawRight(page, medium, 'AMOUNT', right - 8, y - 13, { size: 7, color: WHITE });
  y -= 35;

  const items = Array.isArray(invoice.lineItems) && invoice.lineItems.length
    ? invoice.lineItems.slice(0, 8)
    : [{ description: invoice.title || 'Professional services', quantity: 1, unitPrice: invoice.subtotal || invoice.total }];
  items.forEach((item, index) => {
    const lines = wrappedLines(regular, item.description || 'Professional services', 8.5, width - 286, 3);
    const rowHeight = Math.max(34, lines.length * 11 + 15);
    if (index % 2 === 1) page.drawRectangle({ x: 48, y: y - rowHeight + 5, width: width - 96, height: rowHeight, color: SURFACE });
    lines.forEach((line, lineIndex) => page.drawText(line, { x: 60, y: y - 10 - lineIndex * 11, size: 8.5, font: regular, color: INK }));
    const quantity = Number(item.quantity || 0);
    const rate = Number(item.unitPrice ?? item.rate ?? 0);
    drawRight(page, regular, quantity.toFixed(2).replace(/\.00$/, ''), right - 150, y - 10, { size: 8.5 });
    drawRight(page, regular, formatMoney(rate, invoice.currency), right - 75, y - 10, { size: 8.5 });
    drawRight(page, medium, formatMoney(Number(item.amount ?? quantity * rate), invoice.currency), right - 8, y - 10, { size: 8.5, color: NAVY });
    y -= rowHeight;
    page.drawLine({ start: { x: 48, y: y + 4 }, end: { x: right, y: y + 4 }, thickness: 0.5, color: BORDER });
  });

  y -= 20;
  const totalRows = [
    ['Subtotal', invoice.subtotal],
    ...(invoice.chargeTax ? [[invoice.taxLabel || 'Tax', invoice.taxAmount]] : []),
    ['Total', invoice.total],
    ['Amount paid', invoice.amountPaid],
  ];
  totalRows.forEach(([rowLabel, value], index) => {
    const rowY = y - index * 20;
    page.drawText(rowLabel, { x: width - 255, y: rowY, size: 8.5, font: index >= 2 ? medium : regular, color: INK });
    drawRight(page, index >= 2 ? medium : regular, formatMoney(value, invoice.currency), right, rowY, { size: 8.5, color: index >= 2 ? NAVY : INK });
  });
  y -= totalRows.length * 20 + 8;
  page.drawRectangle({ x: width - 267, y: y - 29, width: 219, height: 39, color: NAVY });
  page.drawText('BALANCE DUE', { x: width - 253, y: y - 14, size: 8, font: medium, color: WHITE });
  drawRight(page, medium, formatMoney(invoice.balanceDue, invoice.currency), right - 12, y - 14, { size: 11, color: WHITE });

  const noteY = Math.max(92, y - 62);
  if (invoice.notes) {
    label(page, medium, 'Notes', 48, noteY);
    drawWrapped(page, regular, invoice.notes, { x: 48, y: noteY - 15, size: 8, maxWidth: width - 96, maxLines: 3, color: MUTED });
  }

  const footerY = 34;
  page.drawLine({ start: { x: 48, y: footerY + 18 }, end: { x: right, y: footerY + 18 }, thickness: 0.6, color: BORDER });
  const footerContact = [invoice.sender?.website || 'mspixelpulse.com', invoice.sender?.email].filter(Boolean).join(' | ');
  page.drawText(footerContact, { x: 48, y: footerY, size: 7, font: regular, color: MUTED });
  drawRight(page, regular, `${invoice.invoiceNumber || 'Invoice'} | Page 1 of 1`, right, footerY, { size: 7, color: MUTED });

  document.setTitle(`Invoice ${invoice.invoiceNumber || ''}`.trim());
  document.setAuthor(invoice.sender?.businessName || 'MSPixelPulse');
  document.setSubject('Professional services invoice');
  return Buffer.from(await document.save());
}

export const invoicePdfInternals = { formatDate, formatMoney, wrappedLines };
