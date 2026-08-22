import crypto from 'node:crypto';

import Invoice from '../models/Invoice.js';
import PortalNotification from '../models/PortalNotification.js';
import Project from '../models/Project.js';
import Receipt from '../models/Receipt.js';
import User from '../models/User.js';
import { removeObject } from '../lib/storage.js';
import { usersRepository } from '../repositories/users.repository.js';

if (!process.argv.includes('--confirm-production')) throw new Error('Focused runtime verification requires --confirm-production');
if (process.env.DATA_PROVIDER !== 'google' || process.env.STORAGE_PROVIDER !== 'google-drive') {
  throw new Error('Focused runtime verification requires Google Sheets and Google Drive');
}

const base = String(process.env.GOOGLE_RUNTIME_TEST_API_BASE || 'https://api.mspixelpulse.com/api').replace(/\/$/, '');
const marker = `billing-runtime-${Date.now()}`;
const password = crypto.randomBytes(18).toString('base64url');
const resources = { users: [], projects: [], invoices: [], receiptPath: '' };
const checks = [];

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function request(path, { method = 'GET', token = '', json } = {}) {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(json === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: json === undefined ? undefined : JSON.stringify(json),
    });
    let body = {};
    try { body = await response.json(); } catch { body = {}; }
    const quotaExceeded = response.status === 429 && /quota exceeded|rate limit/i.test(String(body?.message || body?.error || ''));
    if (quotaExceeded && attempt < 10) {
      await new Promise((resolve) => setTimeout(resolve, 30_000));
      continue;
    }
    return { response, body };
  }
  throw new Error(`${method} ${path} exceeded its retry budget`);
}

function check(name, result, expected = [200]) {
  const passed = expected.includes(result.response.status);
  checks.push({ name, status: result.response.status, passed });
  if (!passed) throw new Error(`${name} failed with HTTP ${result.response.status}: ${result.body?.message || result.body?.error || 'unexpected response'}`);
  return result.body;
}

async function cleanup(name, operation) {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      await operation();
      return;
    } catch (error) {
      if (attempt === 10 || !/quota exceeded|rate limit/i.test(String(error?.message || ''))) throw new Error(`${name}: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 30_000));
    }
  }
}

let runError;
try {
  const admin = await usersRepository.create({
    name: 'Billing Runtime Admin', email: `${marker}-admin@example.com`, password,
    role: 'admin', status: 'active', accountStatus: 'active',
    accessApplication: { status: 'approved', requestedRole: 'client' },
  });
  const client = await usersRepository.create({
    name: 'Billing Runtime Client', email: `${marker}-client@example.com`, password,
    role: 'client', status: 'active', accountStatus: 'active',
    accessApplication: { status: 'approved', requestedRole: 'client' },
  });
  resources.users.push(String(admin._id), String(client._id));

  const project = await Project.create({
    title: `${marker} project`, slug: marker, status: 'active', client: client._id,
  });
  resources.projects.push(String(project._id));
  const invoice = await Invoice.create({
    project: project._id,
    client: client._id,
    invoiceNumber: marker,
    title: 'Focused production receipt verification',
    status: 'sent',
    sourceType: 'generated',
    paymentStage: 'custom',
    paymentPercent: 50,
    projectValue: 500,
    issueDate: new Date(),
    dueDate: new Date(),
    currency: 'CAD',
    lineItems: [{ description: 'Professional web design services', quantity: 1, unitPrice: 250, amount: 250 }],
    subtotal: 250,
    total: 250,
    amountPaid: 0,
    balanceDue: 250,
    sender: { businessName: 'MSPixelPulse', email: 'mspixelpulse@gmail.com', address: 'Toronto, Ontario, Canada' },
    clientDetails: { businessName: 'Runtime Verification Client', email: client.email, address: 'Toronto, Ontario, Canada' },
    pageSize: 'LETTER',
  });
  resources.invoices.push(String(invoice._id));

  const adminToken = check('temporary admin login', await request('/auth/login', {
    method: 'POST', json: { email: admin.email, password },
  })).token;
  const clientToken = check('temporary client login', await request('/auth/login', {
    method: 'POST', json: { email: client.email, password },
  })).token;

  const idempotencyKey = `${marker}-payment`;
  const paid = check('record payment and generate immutable receipt', await request(
    `/projects/${project._id}/invoices/${invoice._id}/payments`,
    {
      method: 'POST', token: adminToken,
      json: {
        idempotencyKey, amount: 125, method: 'Interac e-Transfer', reference: marker,
        note: 'Disposable focused production verification', paymentStage: 'custom',
      },
    },
  ), [201]);
  resources.receiptPath = paid.receipt?.file?.path || '';
  assert(/^MSP-PAY-\d{4}-\d{6}$/.test(paid.payment?.paymentId || ''), 'Stable payment ID was not generated');
  assert(/^MSP-RCT-\d{4}-\d{6}$/.test(paid.receipt?.receiptNumber || ''), 'Stable receipt number was not generated');
  assert(paid.payment.paymentId.split('-').at(-1) === paid.receipt.receiptNumber.split('-').at(-1), 'Payment and receipt do not share one sequence');
  assert(paid.receipt.paymentAmountSnapshot === 125 && paid.receipt.balanceRemainingSnapshot === 125, 'Immutable financial snapshot is incorrect');
  assert(paid.invoice.status === 'partially_paid', 'Invoice did not become partially paid');

  const replay = check('idempotent payment replay', await request(
    `/projects/${project._id}/invoices/${invoice._id}/payments`,
    { method: 'POST', token: adminToken, json: { idempotencyKey, amount: 125, method: 'Interac e-Transfer' } },
  ));
  assert(replay.duplicate === true && replay.receipt.receiptNumber === paid.receipt.receiptNumber, 'Idempotent replay returned a different receipt');

  const receiptList = check('client reads only authorized receipts', await request('/receipts', { token: clientToken }));
  const clientReceipt = receiptList.receipts?.find((receipt) => receipt.receiptNumber === paid.receipt.receiptNumber);
  assert(clientReceipt?.file?.url && !clientReceipt.idempotencyKey, 'Client-safe private receipt was not returned');
  const pdfResponse = await fetch(clientReceipt.file.url);
  const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer());
  checks.push({ name: 'private receipt PDF download', status: pdfResponse.status, passed: pdfResponse.status === 200 });
  assert(pdfResponse.status === 200 && pdfBytes.subarray(0, 4).toString() === '%PDF', 'Private receipt PDF download failed');

  const voided = check('void receipt while retaining audit record', await request(`/receipts/${paid.receipt._id}/void`, {
    method: 'PATCH', token: adminToken, json: { reason: 'Disposable focused production verification' },
  }));
  assert(voided.receipt.status === 'void' && voided.receipt.voidedAt && voided.receipt.voidReason, 'Void audit fields did not persist');

  const notificationList = check('client reads role-aware notifications', await request('/notifications?limit=100', { token: clientToken }));
  const notification = notificationList.notifications?.find((item) => item.relatedEntityId === paid.receipt._id);
  assert(notification && notificationList.unreadCount > 0, 'Receipt notification did not persist for the assigned client');
  check('client marks receipt notification read', await request(`/notifications/${notification._id}/read`, {
    method: 'PATCH', token: clientToken,
  }));
} catch (error) {
  runError = error;
} finally {
  try {
    if (resources.receiptPath) await cleanup('receipt Drive file', () => removeObject(resources.receiptPath));
    await cleanup('notifications', () => PortalNotification.deleteMany({ project: { $in: resources.projects } }));
    await cleanup('receipts', () => Receipt.deleteMany({ project: { $in: resources.projects } }));
    await cleanup('invoices', () => Invoice.deleteMany({ _id: { $in: resources.invoices } }));
    await cleanup('projects', () => Project.deleteMany({ _id: { $in: resources.projects } }));
    await cleanup('users', () => User.deleteMany({ _id: { $in: resources.users } }));
    const remaining = await Promise.all([
      User.countDocuments({ email: { $regex: marker, $options: 'i' } }),
      Project.countDocuments({ title: { $regex: marker, $options: 'i' } }),
      Invoice.countDocuments({ invoiceNumber: marker }),
      Receipt.countDocuments({ paymentReference: marker }),
      PortalNotification.countDocuments({ project: { $in: resources.projects } }),
    ]);
    if (remaining.some(Boolean)) throw new Error(`Focused runtime cleanup left records: ${remaining.join(',')}`);
  } catch (cleanupError) {
    if (!runError) runError = cleanupError;
    else runError.cleanupError = cleanupError;
  }
}

if (runError) throw runError;
console.log(JSON.stringify({ passed: checks.every((item) => item.passed), checks, cleanup: 'verified' }));
