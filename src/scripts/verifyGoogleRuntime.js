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
const adminPassword = crypto.randomBytes(18).toString('base64url');
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

async function request(path, { method = 'GET', token, json, form, expected = [200] } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (json !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: form || (json !== undefined ? JSON.stringify(json) : undefined),
  });
  let body = {};
  try { body = await response.json(); } catch { body = {}; }
  return { status: response.status, body, expected };
}

async function login(email, password, expected = [200]) {
  return request('/auth/login', { method: 'POST', json: { email, password }, expected });
}

async function directUpload(token, file, { purpose, projectId = '', requirementField = '' }) {
  const session = record(`create ${purpose} upload session`, await request('/files/upload-session', {
    method: 'POST',
    token,
    json: { name: file.name, type: file.type, size: file.size, purpose, projectId, requirementField },
  }), [200]).upload;
  const uploadResponse = await fetch(session.url, {
    method: 'PUT',
    headers: { 'content-type': file.type },
    body: file,
  });
  let driveFile = {};
  try { driveFile = await uploadResponse.json(); } catch { driveFile = {}; }
  checks.push({ name: `direct ${purpose} upload to Drive`, status: uploadResponse.status, passed: uploadResponse.ok });
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
  resources.users.push(String(clientA._id), String(clientB._id));

  const projectA = record('admin create project A', await request('/projects', {
    method: 'POST', token: adminToken, expected: [201],
    json: { title: `${marker} project A`, status: 'active', client: clientA._id },
  }), [201]).project;
  const projectB = record('admin create project B', await request('/projects', {
    method: 'POST', token: adminToken, expected: [201],
    json: { title: `${marker} project B`, status: 'active', client: clientB._id },
  }), [201]).project;
  resources.projects.push(String(projectA._id), String(projectB._id));

  const clientALogin = record('client login', await login(clientA.email, passwordA), [200]);
  const clientAToken = clientALogin.token;
  const clientBLogin = record('second client login', await login(clientB.email, passwordB), [200]);
  let clientBToken = clientBLogin.token;

  const clientProjects = record('client project list', await request('/projects', { token: clientAToken }), [200]);
  if (!clientProjects.projects?.some((project) => String(project._id) === String(projectA._id))) {
    throw new Error('Assigned project was missing from the client project list');
  }
  record('assigned client opens own project', await request(`/projects/${projectA._id}`, { token: clientAToken }), [200]);
  record('cross-client project access denied', await request(`/projects/${projectB._id}`, {
    token: clientAToken, expected: [403],
  }), [403]);
  record('admin opens all projects', await request(`/projects/${projectB._id}`, { token: adminToken }), [200]);

  const requirementUpload = await directUpload(
    clientAToken,
    new File([`%PDF-1.4\n% ${marker}`], `${marker}.pdf`, { type: 'application/pdf' }),
    { purpose: 'requirement', projectId: String(projectA._id), requirementField: 'supporting' },
  );
  resources.paths.push(requirementUpload.file.path);
  record('client saves requirements', await request(`/projects/${projectA._id}/requirements`, {
    method: 'PUT', token: clientAToken,
    json: {
      pages: [{ name: 'Home', note: marker }],
      uploadedFiles: { supporting: [requirementUpload.file], pageFiles: {} },
    },
  }), [200]);
  const requirement = record('requirements persist after read', await request(`/projects/${projectA._id}/requirements`, {
    token: clientAToken,
  }), [200]);
  if (!requirement.requirement?.pages?.some((page) => page.note === marker)) throw new Error('Requirement note did not persist');

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

  record('admin creates invoice', await request(`/projects/${projectA._id}/invoices`, {
    method: 'POST', token: adminToken, expected: [201],
    json: { kind: 'advance', invoiceNumber: marker, title: 'Runtime invoice', lineItems: [{ description: 'QA', quantity: 1, unitPrice: 25, amount: 25 }] },
  }), [201]);
  const invoices = record('client reads billing', await request(`/projects/${projectA._id}/invoices`, {
    token: clientAToken,
  }), [200]);
  if (!invoices.invoices?.some((invoice) => invoice.invoiceNumber === marker)) throw new Error('Invoice did not persist');

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
    try { await operation(); } catch (error) { cleanupErrors.push(`${name}: ${error.message}`); }
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
