import crypto from 'node:crypto';
import { usersRepository } from '../repositories/users.repository.js';
import Invoice from '../models/Invoice.js';
import Message from '../models/Message.js';
import Project from '../models/Project.js';
import Requirement from '../models/Requirement.js';
import Room from '../models/Room.js';
import SupportTicket from '../models/SupportTicket.js';
import User from '../models/User.js';
import { removeObjects as removePaths } from '../lib/storage.js';
import { googleFilesRepository } from '../repositories/files.repository.js';

if (!process.argv.includes('--confirm-production')) throw new Error('Runtime verification requires --confirm-production');
if (process.env.DATA_PROVIDER !== 'google' || process.env.STORAGE_PROVIDER !== 'google-drive') {
  throw new Error('Runtime verification requires DATA_PROVIDER=google and STORAGE_PROVIDER=google-drive');
}

const base = String(process.env.GOOGLE_RUNTIME_TEST_API_BASE || 'http://127.0.0.1:4311/api').replace(/\/$/, '');
const marker = `google-runtime-${Date.now()}`;
const passwordA = crypto.randomBytes(18).toString('base64url');
const passwordB = crypto.randomBytes(18).toString('base64url');
const passwordB2 = crypto.randomBytes(18).toString('base64url');
const developerPassword = crypto.randomBytes(18).toString('base64url');
const adminPassword = crypto.randomBytes(18).toString('base64url');
const browserOrigin = 'https://mspixelpulse.com';
const resources = { users: [], projects: [], paths: [], tickets: [] };
const checks = [];

function record(name, response, expected) {
  const passed = expected.includes(response.status);
  checks.push({ name, status: response.status, passed });
  if (!passed) {
    const error = new Error(`${name} failed with HTTP ${response.status}: ${response.body?.message || response.body?.error || 'unexpected response'}`);
    error.status = response.status;
    throw error;
  }
  return response.body;
}

async function request(path, { method = 'GET', token, json, form, origin = '', expected = [200] } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (json !== undefined) headers['content-type'] = 'application/json';
  if (origin) headers.origin = origin;
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: form || (json !== undefined ? JSON.stringify(json) : undefined),
  });
  let body = {};
  try { body = await response.json(); } catch { body = {}; }
  return { status: response.status, body, headers: response.headers, expected };
}

async function login(email, password, expected = [200]) {
  return request('/auth/login', { method: 'POST', json: { email, password }, expected });
}

async function directUpload(token, file, { purpose, projectId = '', requirementField = '' }) {
  const sessionResponse = await request('/files/upload-session', {
    method: 'POST',
    token,
    origin: browserOrigin,
    json: { name: file.name, type: file.type, size: file.size, purpose, projectId, requirementField },
  });
  const session = record(`create ${purpose} upload session`, sessionResponse, [200]).upload;
  const sessionAllowOrigin = sessionResponse.headers.get('access-control-allow-origin');
  checks.push({
    name: `browser origin accepted for ${purpose} upload session`,
    status: sessionResponse.status,
    passed: [browserOrigin, '*'].includes(sessionAllowOrigin),
  });
  if (![browserOrigin, '*'].includes(sessionAllowOrigin)) {
    throw new Error(`${purpose} upload session did not allow the production browser origin`);
  }
  const uploadResponse = await fetch(session.url, {
    method: 'PUT',
    headers: { 'content-type': file.type, origin: browserOrigin },
    body: file,
  });
  let driveFile = {};
  try { driveFile = await uploadResponse.json(); } catch { driveFile = {}; }
  checks.push({ name: `direct ${purpose} upload to Drive`, status: uploadResponse.status, passed: uploadResponse.ok });
  const driveAllowOrigin = uploadResponse.headers.get('access-control-allow-origin');
  checks.push({
    name: `Drive exposes ${purpose} upload response to browser`,
    status: uploadResponse.status,
    passed: [browserOrigin, '*'].includes(driveAllowOrigin),
  });
  if (![browserOrigin, '*'].includes(driveAllowOrigin)) {
    throw new Error(`Drive did not expose the ${purpose} upload response to the production browser origin`);
  }
  if (!uploadResponse.ok || !driveFile.id) {
    const reason = String(driveFile?.error?.message || '').slice(0, 240);
    throw new Error(`Direct ${purpose} upload failed with HTTP ${uploadResponse.status}${reason ? `: ${reason}` : ''}`);
  }
  return record(`finalize ${purpose} upload`, await request('/files/upload-complete', {
    method: 'POST',
    token,
    json: { driveFileId: driveFile.id, completionToken: session.completionToken },
  }), [200]);
}

async function uploadInvoicePdf(token, projectId, file, invoice) {
  const sessionResponse = await request(`/projects/${projectId}/invoices/upload-session`, {
    method: 'POST',
    token,
    origin: browserOrigin,
    json: {
      name: file.name,
      type: file.type,
      size: file.size,
      kind: 'other',
      invoice,
    },
  });
  const session = record('admin creates generated invoice upload session', sessionResponse, [200]).upload;
  const sessionAllowOrigin = sessionResponse.headers.get('access-control-allow-origin');
  checks.push({
    name: 'browser origin accepted for generated invoice upload session',
    status: sessionResponse.status,
    passed: [browserOrigin, '*'].includes(sessionAllowOrigin),
  });
  if (![browserOrigin, '*'].includes(sessionAllowOrigin)) {
    throw new Error('Generated invoice upload session did not allow the production browser origin');
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const uploadResponse = await fetch(`${base}/projects/${projectId}/invoices/upload-chunk`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      origin: browserOrigin,
      'content-type': 'application/octet-stream',
      'content-range': `bytes 0-${bytes.length - 1}/${bytes.length}`,
      'x-upload-token': session.token,
    },
    body: bytes,
  });
  let body = {};
  try { body = await uploadResponse.json(); } catch { body = {}; }
  return record('admin uploads generated invoice PDF', {
    status: uploadResponse.status,
    body,
    headers: uploadResponse.headers,
  }, [201]);
}

let runError;
try {
  const tempAdmin = await usersRepository.create({
    name: 'Google Runtime QA Admin',
    email: `${marker}-admin@example.com`,
    password: adminPassword,
    role: 'admin',
    status: 'active',
    accountStatus: 'active',
    accessApplication: { status: 'approved', requestedRole: 'client' },
  });
  resources.users.push(String(tempAdmin._id || tempAdmin.id));
  const adminLogin = record('admin login', await login(tempAdmin.email, adminPassword), [200]);
  const adminToken = adminLogin.token;

  const clientA = record('admin create client A', await request('/admin/users', {
    method: 'POST', token: adminToken, expected: [201],
    json: { name: 'Runtime Client A', email: `${marker}-a@example.com`, password: passwordA, role: 'client', status: 'active' },
  }), [201]).user;
  const clientB = record('admin create client B', await request('/admin/users', {
    method: 'POST', token: adminToken, expected: [201],
    json: { name: 'Runtime Client B', email: `${marker}-b@example.com`, password: passwordB, role: 'client', status: 'active' },
  }), [201]).user;
  const developer = record('admin create assigned developer', await request('/admin/users', {
    method: 'POST', token: adminToken, expected: [201],
    json: { name: 'Runtime Developer', email: `${marker}-dev@example.com`, password: developerPassword, role: 'developer', status: 'active' },
  }), [201]).user;
  resources.users.push(String(clientA._id), String(clientB._id), String(developer._id));

  const projectA = record('admin create project A', await request('/projects', {
    method: 'POST', token: adminToken, expected: [201],
    json: { title: `${marker} project A`, status: 'active', client: clientA._id, developer: developer._id },
  }), [201]).project;
  const projectB = record('admin create project B', await request('/projects', {
    method: 'POST', token: adminToken, expected: [201],
    json: { title: `${marker} project B`, status: 'active', client: clientB._id },
  }), [201]).project;
  resources.projects.push(String(projectA._id), String(projectB._id));

  const clientALogin = record('client login', await login(clientA.email, passwordA), [200]);
  let clientAToken = clientALogin.token;
  const clientBLogin = record('second client login', await login(clientB.email, passwordB), [200]);
  let clientBToken = clientBLogin.token;
  const developerLogin = record('assigned developer login', await login(developer.email, developerPassword), [200]);
  const developerToken = developerLogin.token;

  const clientProjects = record('client project list', await request('/projects', { token: clientAToken }), [200]);
  if (!clientProjects.projects?.some((project) => String(project._id) === String(projectA._id))) {
    throw new Error('Assigned project was missing from the client project list');
  }
  record('assigned client opens own project', await request(`/projects/${projectA._id}`, { token: clientAToken }), [200]);
  record('cross-client project access denied', await request(`/projects/${projectB._id}`, {
    token: clientAToken, expected: [403],
  }), [403]);
  record('admin opens all projects', await request(`/projects/${projectB._id}`, { token: adminToken }), [200]);

  const developerProjects = record('developer project list', await request('/projects', { token: developerToken }), [200]);
  if (!developerProjects.projects?.some((project) => String(project._id) === String(projectA._id))) {
    throw new Error('Assigned project was missing from the developer project list');
  }
  if (developerProjects.projects?.some((project) => String(project._id) === String(projectB._id))) {
    throw new Error('Unassigned project leaked into the developer project list');
  }
  record('assigned developer opens project', await request(`/projects/${projectA._id}`, { token: developerToken }), [200]);
  record('unassigned developer project access denied', await request(`/projects/${projectB._id}`, {
    token: developerToken, expected: [403],
  }), [403]);

  record('cross-client requirements access denied', await request(`/projects/${projectA._id}/requirements`, {
    token: clientBToken, expected: [403],
  }), [403]);
  record('cross-client requirement upload denied', await request('/files/upload-session', {
    method: 'POST',
    token: clientBToken,
    origin: browserOrigin,
    expected: [403],
    json: {
      name: `${marker}-denied.pdf`,
      type: 'application/pdf',
      size: 64,
      purpose: 'requirement',
      projectId: String(projectA._id),
      requirementField: 'supporting',
    },
  }), [403]);

  const tinyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=',
    'base64',
  );
  const initialLogo = await directUpload(
    clientAToken,
    new File([tinyPng], `${marker}-logo.png`, { type: 'image/png' }),
    { purpose: 'requirement', projectId: String(projectA._id), requirementField: 'logo' },
  );
  const brief = await directUpload(
    clientAToken,
    new File([`%PDF-1.4\n% brief ${marker}`], `${marker}-brief.pdf`, { type: 'application/pdf' }),
    { purpose: 'requirement', projectId: String(projectA._id), requirementField: 'brief' },
  );
  const supportingA = await directUpload(
    clientAToken,
    new File([`%PDF-1.4\n% supporting A ${marker}`], `${marker}-support-a.pdf`, { type: 'application/pdf' }),
    { purpose: 'requirement', projectId: String(projectA._id), requirementField: 'supporting' },
  );
  const supportingB = await directUpload(
    clientAToken,
    new File([`%PDF-1.4\n% supporting B ${marker}`], `${marker}-support-b.pdf`, { type: 'application/pdf' }),
    { purpose: 'requirement', projectId: String(projectA._id), requirementField: 'supporting' },
  );
  const pageUpload = await directUpload(
    clientAToken,
    new File([tinyPng], `${marker}-home-reference.png`, { type: 'image/png' }),
    { purpose: 'requirement', projectId: String(projectA._id), requirementField: 'page:Home' },
  );
  resources.paths.push(
    initialLogo.file.path,
    brief.file.path,
    supportingA.file.path,
    supportingB.file.path,
    pageUpload.file.path,
  );

  record('client saves logo brief supporting and page files', await request(`/projects/${projectA._id}/requirements`, {
    method: 'PUT', token: clientAToken,
    json: {
      pages: [{ name: 'Home', note: marker }],
      uploadedFiles: {
        logo: initialLogo.file,
        brief: brief.file,
        supporting: [supportingA.file, supportingB.file],
        pageFiles: { Home: [pageUpload.file] },
      },
    },
  }), [200]);

  const replacementLogo = await directUpload(
    clientAToken,
    new File([tinyPng, marker], `${marker}-logo-replacement.png`, { type: 'image/png' }),
    { purpose: 'requirement', projectId: String(projectA._id), requirementField: 'logo' },
  );
  resources.paths.push(replacementLogo.file.path);
  record('client replaces only the logo with case-insensitive page metadata', await request(`/projects/${projectA._id}/requirements`, {
    method: 'PUT', token: clientAToken,
    json: {
      pages: [{ name: 'home', note: `${marker} updated` }],
      uploadedFiles: { logo: replacementLogo.file, supporting: [], pageFiles: {} },
    },
  }), [200]);

  const requirement = record('requirements persist after read', await request(`/projects/${projectA._id}/requirements`, {
    token: clientAToken,
  }), [200]);
  const persistedRequirement = requirement.requirement;
  const homePages = persistedRequirement?.pages?.filter((page) => String(page.name).toLowerCase() === 'home') || [];
  if (
    !persistedRequirement?.logo?.path ||
    persistedRequirement.logo.path !== replacementLogo.file.path ||
    persistedRequirement.brief?.path !== brief.file.path ||
    persistedRequirement.supporting?.length !== 2 ||
    homePages.length !== 1 ||
    homePages[0].note !== `${marker} updated` ||
    homePages[0].files?.length !== 1
  ) {
    throw new Error('Complete requirement payload did not persist or merge non-destructively');
  }
  const oldLogoResponse = await fetch(initialLogo.file.url);
  checks.push({
    name: 'replaced requirement logo is removed from Drive',
    status: oldLogoResponse.status,
    passed: oldLogoResponse.status === 404,
  });
  if (oldLogoResponse.status !== 404) throw new Error(`Old requirement logo remained accessible with HTTP ${oldLogoResponse.status}`);

  record('admin reads client requirements', await request(`/projects/${projectA._id}/requirements`, {
    token: adminToken,
  }), [200]);
  record('assigned developer reads client requirements', await request(`/projects/${projectA._id}/requirements`, {
    token: developerToken,
  }), [200]);
  record('unassigned developer requirements access denied', await request(`/projects/${projectB._id}/requirements`, {
    token: developerToken, expected: [403],
  }), [403]);
  record('assigned developer marks requirements reviewed', await request(`/projects/${projectA._id}/requirements/review`, {
    method: 'PATCH', token: developerToken, json: { reviewed: true },
  }), [200]);

  const createdAnnouncement = record('assigned developer posts announcement', await request(`/projects/${projectA._id}/announcements`, {
    method: 'POST', token: developerToken, expected: [201], json: { title: marker, body: 'Developer runtime announcement' },
  }), [201]).announcement;
  if (createdAnnouncement.authorName !== developer.name || createdAnnouncement.authorRole !== 'developer' || !createdAnnouncement.ts) {
    throw new Error('Announcement author or timestamp metadata was missing');
  }
  const evidenceResult = record('assigned developer posts evidence', await request(`/projects/${projectA._id}/evidence`, {
    method: 'POST', token: developerToken, expected: [201], json: { title: marker, links: ['https://example.com'], images: [] },
  }), [201]);
  const createdEvidence = evidenceResult.project?.evidence?.find((entry) => entry.title === marker);
  if (createdEvidence?.authorName !== developer.name || createdEvidence?.authorRole !== 'developer' || !createdEvidence?.ts) {
    throw new Error('Evidence author or timestamp metadata was missing');
  }
  record('client cannot post announcements', await request(`/projects/${projectA._id}/announcements`, {
    method: 'POST', token: clientAToken, expected: [403], json: { title: marker },
  }), [403]);
  record('client cannot post evidence', await request(`/projects/${projectA._id}/evidence`, {
    method: 'POST', token: clientAToken, expected: [403], json: { title: marker, images: [] },
  }), [403]);
  record('developer cannot delete announcements', await request(`/projects/${projectA._id}/announcements/0`, {
    method: 'DELETE', token: developerToken, expected: [403],
  }), [403]);
  const clientAnnouncements = record('client reads developer announcement', await request(`/projects/${projectA._id}/announcements`, {
    token: clientAToken,
  }), [200]);
  if (!clientAnnouncements.items?.some((entry) => entry.title === marker && entry.authorRole === 'developer' && entry.ts)) {
    throw new Error('Developer announcement was not visible to the assigned client');
  }
  const clientProjectAfterEvidence = record('client reads developer evidence', await request(`/projects/${projectA._id}`, {
    token: clientAToken,
  }), [200]);
  if (!clientProjectAfterEvidence.project?.evidence?.some((entry) => entry.title === marker && entry.authorRole === 'developer' && entry.ts)) {
    throw new Error('Developer evidence was not visible to the assigned client');
  }

  const uploaded = (await directUpload(
    clientAToken,
    new File([`MSPixelPulse ${marker}`], `${marker}.txt`, { type: 'text/plain' }),
    { purpose: 'message', projectId: String(projectA._id) },
  )).file;
  resources.paths.push(uploaded.path);
  record('client sends room message', await request(`/rooms/${projectA._id}/messages`, {
    method: 'POST', token: clientAToken, json: { text: marker, attachments: [uploaded] },
  }), [200]);
  const room = record('room message persists after read', await request(`/rooms/${projectA._id}/messages`, {
    token: clientAToken,
  }), [200]);
  if (!room.messages?.some((message) => message.text === marker)) throw new Error('Room message did not persist');
  const download = await fetch(uploaded.url);
  checks.push({ name: 'signed Drive attachment download', status: download.status, passed: download.status === 200 });
  if (download.status !== 200 || !(await download.text()).includes(marker)) throw new Error('Drive attachment download failed');

  const issueDate = new Date().toISOString().slice(0, 10);
  const dueDateValue = new Date(`${issueDate}T12:00:00.000Z`);
  dueDateValue.setUTCDate(dueDateValue.getUTCDate() + 14);
  const dueDate = dueDateValue.toISOString().slice(0, 10);
  const uploadedInvoice = await uploadInvoicePdf(
    adminToken,
    String(projectA._id),
    new File(
      [`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n${marker}`],
      `${marker}-invoice.pdf`,
      { type: 'application/pdf' },
    ),
    {
      invoiceNumber: marker,
      title: 'Runtime invoice',
      status: 'sent',
      sourceType: 'generated',
      paymentStage: 'custom',
      paymentPercent: 25,
      projectValue: 2000,
      paymentTermsPreset: 'net_14',
      issueDate,
      dueDate,
      currency: 'CAD',
      lineItems: [{ description: 'Custom 25% project payment', quantity: 1, unitPrice: 500, amount: 500 }],
      amountPaid: 0,
      paymentNotice: 'Please include the invoice number with your payment.',
      paymentReference: marker,
      paymentMethods: [{
        key: 'interac',
        label: 'Interac e-Transfer',
        enabled: true,
        instructions: 'Contact MSPixelPulse for secure payment instructions.',
      }],
      scopeTerms: 'This invoice covers the agreed project scope.',
      refundTerms: 'Payments are subject to the signed agreement and applicable law.',
      closingMessage: 'Thank you for your business.',
      footerText: 'MSPixelPulse · Toronto, Ontario, Canada',
      showPageNumbers: true,
    },
  );
  resources.paths.push(uploadedInvoice.invoice.file.path);
  if (
    uploadedInvoice.invoice.status !== 'sent' ||
    uploadedInvoice.invoice.paymentStage !== 'custom' ||
    uploadedInvoice.invoice.paymentPercent !== 25 ||
    uploadedInvoice.invoice.projectValue !== 2000 ||
    uploadedInvoice.invoice.total !== 500 ||
    uploadedInvoice.invoice.balanceDue !== 500 ||
    uploadedInvoice.invoice.amountPaid !== 0 ||
    uploadedInvoice.invoice.paymentTermsPreset !== 'net_14' ||
    String(uploadedInvoice.invoice.dueDate || '').slice(0, 10) !== dueDate ||
    !uploadedInvoice.invoice.file?.path
  ) {
    throw new Error('Generated invoice metadata, balance, due terms, or Drive file did not persist');
  }
  let invoices;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    invoices = record(`client reads billing (attempt ${attempt})`, await request(`/projects/${projectA._id}/invoices`, {
      token: clientAToken,
    }), [200]);
    if (invoices.invoices?.some((invoice) => invoice.invoiceNumber === marker)) break;
    await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
  }
  const clientInvoice = invoices.invoices?.find((invoice) => invoice.invoiceNumber === marker);
  if (!clientInvoice) throw new Error('Invoice did not persist');
  if (
    clientInvoice.paymentStage !== 'custom' ||
    clientInvoice.paymentPercent !== 25 ||
    clientInvoice.projectValue !== 2000 ||
    clientInvoice.total !== 500 ||
    clientInvoice.balanceDue !== 500 ||
    clientInvoice.status !== 'sent' ||
    clientInvoice.paymentMethods?.[0]?.label !== 'Interac e-Transfer' ||
    !clientInvoice.file?.url
  ) {
    throw new Error('Generated invoice was not fully visible to the assigned client');
  }

  const ticket = record('client creates support request', await request('/support', {
    method: 'POST', token: clientAToken, expected: [201], json: { subject: marker, message: 'Runtime support request' },
  }), [201]).ticket;
  resources.tickets.push(String(ticket._id));
  record('client replies to support request', await request(`/support/${ticket._id}/replies`, {
    method: 'POST', token: clientAToken, json: { message: `${marker} reply` },
  }), [200]);
  const persistedTicket = record('support request persists after read', await request(`/support/${ticket._id}`, {
    token: clientAToken,
  }), [200]);
  if (!persistedTicket.ticket?.replies?.some((reply) => reply.body === `${marker} reply`)) throw new Error('Support reply did not persist');

  const profileBefore = record('client profile read', await request('/users/me', { token: clientAToken }), [200]).user;
  record('client profile and settings update', await request('/users/me', {
    method: 'PATCH', token: clientAToken,
    json: { phone: marker, themePreference: 'light', notificationPreferences: { portalUpdates: true, emailUpdates: false, billingAlerts: true } },
  }), [200]);
  const profileAfter = record('profile and settings persist', await request('/users/me', { token: clientAToken }), [200]).user;
  if (profileAfter.phone !== marker || profileAfter.themePreference !== 'light') throw new Error('Profile settings did not persist');
  record('client logout before theme persistence check', await request('/auth/logout', {
    method: 'POST', token: clientAToken,
  }), [200]);
  clientAToken = record('client login after theme update', await login(clientA.email, passwordA), [200]).token;
  const profileAfterLogin = record('theme preference persists after fresh login', await request('/users/me', {
    token: clientAToken,
  }), [200]).user;
  if (profileAfterLogin.themePreference !== 'light') throw new Error('Theme preference did not persist after a fresh login');

  const avatarForm = new FormData();
  avatarForm.append('avatar', new File([
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=', 'base64'),
  ], `${marker}.png`, { type: 'image/png' }));
  const uploadedAvatar = record('client avatar multipart upload', await request('/users/me/avatar', {
    method: 'POST', token: clientAToken, form: avatarForm,
  }), [200]);
  if (!uploadedAvatar.avatarPath || !uploadedAvatar.avatarUrl) throw new Error('Avatar upload did not persist a Drive-backed profile value');
  const replacementAvatarForm = new FormData();
  replacementAvatarForm.append('avatar', new File([
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+RRCnVAAAAABJRU5ErkJggg==', 'base64'),
  ], `${marker}-replacement.png`, { type: 'image/png' }));
  const replacementAvatar = record('client avatar replacement upload', await request('/users/me/avatar', {
    method: 'POST', token: clientAToken, form: replacementAvatarForm,
  }), [200]);
  if (!replacementAvatar.avatarPath || replacementAvatar.avatarPath === uploadedAvatar.avatarPath) {
    throw new Error('Avatar replacement did not persist a new Drive path');
  }
  const oldAvatarResponse = await fetch(uploadedAvatar.avatarUrl);
  checks.push({ name: 'replaced avatar is removed from Drive', status: oldAvatarResponse.status, passed: oldAvatarResponse.status === 404 });
  if (oldAvatarResponse.status !== 404) throw new Error(`Old avatar remained accessible with HTTP ${oldAvatarResponse.status}`);
  const avatarProfile = record('avatar persists after profile reload', await request('/users/me', {
    token: clientAToken,
  }), [200]).user;
  if (avatarProfile.avatarPath !== replacementAvatar.avatarPath || !avatarProfile.avatarUrl) throw new Error('Avatar did not persist after profile reload');
  record('client avatar remove', await request('/users/me/avatar', {
    method: 'DELETE', token: clientAToken,
  }), [200]);
  record('client profile restore', await request('/users/me', {
    method: 'PATCH', token: clientAToken,
    json: {
      phone: profileBefore.phone || '',
      themePreference: profileBefore.themePreference || 'dark',
      notificationPreferences: profileBefore.notificationPreferences || { portalUpdates: true, emailUpdates: true, billingAlerts: true },
    },
  }), [200]);

  record('admin changes client password', await request(`/admin/users/${clientB._id}/password`, {
    method: 'PATCH', token: adminToken, json: { password: passwordB2 },
  }), [200]);
  record('old password is invalidated', await login(clientB.email, passwordB, [401]), [401]);
  record('new password works', await login(clientB.email, passwordB2), [200]);
  record('admin suspends client', await request(`/admin/users/${clientB._id}`, {
    method: 'PATCH', token: adminToken, json: { status: 'suspended' },
  }), [200]);
  record('suspended client login denied', await login(clientB.email, passwordB2, [403]), [403]);
  record('admin reactivates client', await request(`/admin/users/${clientB._id}`, {
    method: 'PATCH', token: adminToken, json: { status: 'active' },
  }), [200]);
  clientBToken = record('reactivated client login succeeds', await login(clientB.email, passwordB2), [200]).token;
  record('admin changes role', await request(`/admin/users/${clientB._id}/role`, {
    method: 'PATCH', token: adminToken, json: { role: 'developer' },
  }), [200]);
  record('admin restores role', await request(`/admin/users/${clientB._id}/role`, {
    method: 'PATCH', token: adminToken, json: { role: 'client' },
  }), [200]);

  record('second client sends history before deletion', await request(`/rooms/${projectB._id}/messages`, {
    method: 'POST', token: clientBToken, json: { text: `${marker} deletion history`, attachments: [] },
  }), [200]);
  record('admin permanently deletes user with history', await request(`/admin/users/${clientB._id}`, {
    method: 'DELETE', token: adminToken,
  }), [200]);
  resources.users = resources.users.filter((id) => id !== String(clientB._id));
  record('deleted client login denied', await login(clientB.email, passwordB2, [401]), [401]);
  record('deleted user no longer appears', await request(`/admin/users/${clientB._id}`, {
    token: adminToken, expected: [404],
  }), [404]);
  record('client logout', await request('/auth/logout', { method: 'POST', token: clientAToken }), [200]);

} catch (error) {
  runError = error;
} finally {
  const cleanupErrors = [];
  const cleanup = async (name, operation) => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        await operation();
        return;
      } catch (error) {
        const quotaExceeded = /quota exceeded|rate limit/i.test(String(error?.message || ''));
        if (quotaExceeded && attempt < 5) {
          await new Promise((resolve) => setTimeout(resolve, 15_000));
          continue;
        }
        cleanupErrors.push(`${name}: ${error.message}`);
        return;
      }
    }
  };
  await cleanup('Drive files', () => removePaths(resources.paths));
  await cleanup('messages', () => Message.deleteMany({ project: { $in: resources.projects } }));
  await cleanup('requirements', () => Requirement.deleteMany({ project: { $in: resources.projects } }));
  await cleanup('invoices', () => Invoice.deleteMany({ project: { $in: resources.projects } }));
  await cleanup('rooms', () => Room.deleteMany({ project: { $in: resources.projects } }));
  await cleanup('support tickets', () => SupportTicket.deleteMany({ _id: { $in: resources.tickets } }));
  await cleanup('projects', () => Project.deleteMany({
    $or: [{ _id: { $in: resources.projects } }, { title: { $regex: marker, $options: 'i' } }],
  }));
  await cleanup('users', () => User.deleteMany({
    $or: [{ _id: { $in: resources.users } }, { email: { $regex: marker, $options: 'i' } }],
  }));

  await cleanup('cleanup verification', async () => {
    const [userCount, projectCount, messageCount, requirementCount, invoiceCount, ticketCount, fileRows] = await Promise.all([
      User.countDocuments({ email: { $regex: marker, $options: 'i' } }),
      Project.countDocuments({ title: { $regex: marker, $options: 'i' } }),
      Message.countDocuments({ text: { $regex: marker, $options: 'i' } }),
      Requirement.countDocuments({ 'pages.note': { $regex: marker, $options: 'i' } }),
      Invoice.countDocuments({ invoiceNumber: marker }),
      SupportTicket.countDocuments({ subject: marker }),
      googleFilesRepository.list({ pageSize: 1000 }),
    ]);
    const markedFiles = fileRows.items.filter((file) => String(file.originalName || file.logicalPath || '').includes(marker)).length;
    const remaining = userCount + projectCount + messageCount + requirementCount + invoiceCount + ticketCount + markedFiles;
    if (remaining) throw new Error(`${remaining} runtime QA records remain after cleanup`);
  });
  if (cleanupErrors.length) {
    const cleanupError = new Error(`Runtime QA cleanup failed: ${cleanupErrors.join('; ')}`);
    if (!runError) runError = cleanupError;
    else runError.cleanupError = cleanupError;
  }
}

if (runError) throw runError;
console.log(JSON.stringify({ passed: checks.every((check) => check.passed), checks }));
