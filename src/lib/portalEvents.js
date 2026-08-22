import PortalNotification from '../models/PortalNotification.js';
import Project from '../models/Project.js';
import SiteContent from '../models/SiteContent.js';
import User from '../models/User.js';
import { brandedEmail } from './mailer.js';
import { deliverNotification } from './notificationService.js';

export const PORTAL_EVENT_CATEGORIES = Object.freeze([
  'requirements', 'projects', 'messages', 'announcements', 'evidence',
  'billing', 'leads', 'support', 'system',
]);

const CATEGORY_TAGS = Object.freeze({
  requirements: 'REQUIREMENT',
  projects: 'PROJECT',
  messages: 'MESSAGE',
  announcements: 'ANNOUNCEMENT',
  evidence: 'EVIDENCE',
  billing: 'BILLING',
  leads: 'LEAD',
  support: 'SUPPORT',
  system: 'SYSTEM',
});

const DEFAULT_OPERATIONAL_EMAIL = 'mspixelpulse@gmail.com';
const DEFAULT_PORTAL_URL = 'https://mspixelpulse.com';
const SETTINGS_CACHE_MS = 60_000;
let settingsCache = { expiresAt: 0, value: null };

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function idOf(value) {
  if (!value) return '';
  return String(value?._id || value?.id || value);
}

function portalBaseUrl() {
  return clean(process.env.PORTAL_BASE_URL || process.env.FRONTEND_URL || process.env.PUBLIC_SITE_URL || DEFAULT_PORTAL_URL, 400).replace(/\/+$/, '');
}

function operationalRecipient() {
  return clean(process.env.PORTAL_OPERATIONAL_NOTIFICATION_EMAIL || DEFAULT_OPERATIONAL_EMAIL, 200).toLowerCase();
}

function defaultEmailPreferences() {
  return Object.fromEntries(PORTAL_EVENT_CATEGORIES.map((category) => [category, true]));
}

function normalizeEmailPreferences(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(PORTAL_EVENT_CATEGORIES.map((category) => [category, source[category] !== false]));
}

async function operationalEmailPreferences() {
  if (settingsCache.value && settingsCache.expiresAt > Date.now()) return settingsCache.value;
  const record = await SiteContent.findOne({ kind: 'portal-notification-settings', key: 'default' }).lean();
  const value = normalizeEmailPreferences(record?.payload?.emailCategories || defaultEmailPreferences());
  settingsCache = { value, expiresAt: Date.now() + SETTINGS_CACHE_MS };
  return value;
}

export function invalidatePortalNotificationSettingsCache() {
  settingsCache = { expiresAt: 0, value: null };
}

function roleActionUrl(role, actionUrl, actionUrlByRole = {}) {
  const candidate = clean(actionUrlByRole?.[role] || actionUrl, 500);
  if (!candidate) return `/${role === 'developer' ? 'dev' : role}`;
  if (/^https:\/\//i.test(candidate)) return candidate;
  if (candidate.startsWith('/')) return candidate;
  return `/${candidate}`;
}

function eventSubject(category, title) {
  return `[MSP:${CATEGORY_TAGS[category] || 'SYSTEM'}] ${clean(title, 180)}`;
}

function uniqueUsers(users = []) {
  const map = new Map();
  for (const user of users.filter(Boolean)) {
    const id = idOf(user);
    if (id && ['admin', 'developer', 'client'].includes(user.role)) map.set(id, user);
  }
  return [...map.values()];
}

async function resolveRecipients({ actor, project, targets = {} }) {
  const actorId = idOf(actor);
  const resolvedProject = project
    ? (typeof project === 'object' && (project._id || project.id) ? project : await Project.findById(project).lean())
    : null;
  const users = [];

  if (targets.admins) users.push(...await User.find({ role: 'admin', status: 'active' }).lean());
  if (targets.client && resolvedProject?.client) users.push(await User.findById(idOf(resolvedProject.client)).lean());
  if (targets.developer && resolvedProject?.developer) users.push(await User.findById(idOf(resolvedProject.developer)).lean());

  const requestedIds = [...new Set((targets.userIds || []).map(idOf).filter(Boolean))];
  if (requestedIds.length) users.push(...await User.find({ _id: { $in: requestedIds } }).lean());

  return {
    project: resolvedProject,
    recipients: uniqueUsers(users).filter((user) => !targets.excludeActor || idOf(user) !== actorId),
  };
}

function operationalEmail({ category, title, message, actor, project, actionUrl, metadata }) {
  const absoluteActionUrl = /^https:\/\//i.test(actionUrl)
    ? actionUrl
    : `${portalBaseUrl()}${actionUrl.startsWith('/') ? actionUrl : `/${actionUrl}`}`;
  return {
    subject: eventSubject(category, title),
    headers: { 'X-MSPixelPulse-Category': category },
    ...brandedEmail({
      eyebrow: `MSPixelPulse ${CATEGORY_TAGS[category] || 'SYSTEM'}`,
      heading: title,
      intro: message,
      rows: [
        { label: 'Project', value: project?.title || '' },
        { label: 'Actor', value: actor?.name || actor?.email || actor?.role || 'System' },
        { label: 'Reference', value: metadata?.reference || metadata?.invoiceNumber || metadata?.receiptNumber || '' },
        { label: 'Recorded', value: new Date().toISOString() },
      ],
      button: { label: 'Open secure portal', url: absoluteActionUrl },
      footer: 'MSPixelPulse operational notification. Secure details remain inside the portal.',
    }),
  };
}

export async function emitPortalEvent({
  type,
  category,
  title,
  message,
  actor = null,
  project = null,
  relatedEntityType = '',
  relatedEntityId = '',
  actionUrl = '',
  actionUrlByRole = {},
  metadata = {},
  targets = {},
  dedupeKey = '',
  operationalEmail: sendOperationalEmail = true,
} = {}) {
  try {
    if (!type || !PORTAL_EVENT_CATEGORIES.includes(category)) {
      return { ok: false, error: 'INVALID_PORTAL_EVENT' };
    }

    const { project: resolvedProject, recipients } = await resolveRecipients({
      actor,
      project,
      targets: { excludeActor: true, ...targets },
    });
    const actorId = idOf(actor);
    const projectId = idOf(resolvedProject);
    const created = [];

    for (const recipient of recipients) {
      const recipientId = idOf(recipient);
      const recipientDedupe = clean(dedupeKey ? `${dedupeKey}:${recipientId}` : '', 240);
      let notification = recipientDedupe
        ? await PortalNotification.findOne({ dedupeKey: recipientDedupe })
        : null;
      if (!notification) {
        notification = await PortalNotification.create({
          recipient: recipientId,
          recipientRole: recipient.role,
          actor: actorId || null,
          actorRole: actor?.role || (actor ? '' : 'system'),
          type: clean(type, 100),
          category,
          title: clean(title, 180),
          message: clean(message, 800),
          project: projectId || null,
          relatedEntityType: clean(relatedEntityType, 100),
          relatedEntityId: clean(relatedEntityId, 160),
          actionUrl: roleActionUrl(recipient.role, actionUrl, actionUrlByRole),
          metadata,
          dedupeKey: recipientDedupe,
        });
      }
      created.push(notification);
    }

    let emailStatus = 'skipped';
    if (sendOperationalEmail && (await operationalEmailPreferences())[category] !== false) {
      const emailActionUrl = roleActionUrl('admin', actionUrl, actionUrlByRole);
      const log = await deliverNotification({
        type: `portal_event_${category}`,
        relatedEntityType: relatedEntityType || 'PortalEvent',
        relatedEntityId: null,
        recipients: [operationalRecipient()],
        dedupeKey: dedupeKey ? `portal-event-email:${dedupeKey}` : undefined,
        metadata: { category, type, relatedEntityId: clean(relatedEntityId, 160), ...metadata },
        message: operationalEmail({ category, title, message, actor, project: resolvedProject, actionUrl: emailActionUrl, metadata }),
      });
      emailStatus = log?.status || 'failed';
      await Promise.all(created.map(async (notification) => {
        notification.emailStatus = emailStatus;
        await notification.save();
      }));
    }

    return { ok: true, notifications: created.length, emailStatus };
  } catch (error) {
    console.error('Portal event delivery failed', error?.code || error?.name || 'PORTAL_EVENT_FAILED');
    return { ok: false, error: error?.code || 'PORTAL_EVENT_FAILED' };
  }
}

export const portalEventInternals = {
  defaultEmailPreferences,
  eventSubject,
  normalizeEmailPreferences,
  operationalRecipient,
  roleActionUrl,
};
