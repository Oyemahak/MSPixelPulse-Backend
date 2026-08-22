import PortalNotification from '../../../models/PortalNotification.js';
import SiteContent from '../../../models/SiteContent.js';
import {
  PORTAL_EVENT_CATEGORIES,
  invalidatePortalNotificationSettingsCache,
  portalEventInternals,
} from '../../../lib/portalEvents.js';

function userId(req) {
  return String(req.user?._id || '');
}

function boundedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.floor(parsed))) : fallback;
}

export async function listNotifications(req, res, next) {
  try {
    const page = boundedNumber(req.query.page, 1, 1, 10000);
    const limit = boundedNumber(req.query.limit, 30, 1, 100);
    const filter = { recipient: userId(req) };
    if (req.query.filter === 'unread') filter.readAt = null;
    if (PORTAL_EVENT_CATEGORIES.includes(String(req.query.category || ''))) filter.category = req.query.category;

    const [notifications, total, unreadCount] = await Promise.all([
      PortalNotification.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      PortalNotification.countDocuments(filter),
      PortalNotification.countDocuments({ recipient: userId(req), readAt: null }),
    ]);

    return res.json({ notifications, unreadCount, page, limit, total, hasMore: page * limit < total });
  } catch (error) {
    return next(error);
  }
}

export async function markNotificationRead(req, res, next) {
  try {
    const notification = await PortalNotification.findOne({ _id: req.params.notificationId, recipient: userId(req) });
    if (!notification) return res.status(404).json({ error: 'Notification not found' });
    if (!notification.readAt) {
      notification.readAt = new Date();
      await notification.save();
    }
    return res.json({ ok: true, notification });
  } catch (error) {
    return next(error);
  }
}

export async function markAllNotificationsRead(req, res, next) {
  try {
    const unread = await PortalNotification.find({ recipient: userId(req), readAt: null }).limit(1000);
    const readAt = new Date();
    await Promise.all(unread.map(async (notification) => {
      notification.readAt = readAt;
      await notification.save();
    }));
    return res.json({ ok: true, updated: unread.length, readAt });
  } catch (error) {
    return next(error);
  }
}

export async function getNotificationSettings(req, res, next) {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const record = await SiteContent.findOne({ kind: 'portal-notification-settings', key: 'default' }).lean();
    return res.json({
      settings: {
        operationalRecipient: portalEventInternals.operationalRecipient(),
        emailCategories: portalEventInternals.normalizeEmailPreferences(record?.payload?.emailCategories),
      },
    });
  } catch (error) {
    return next(error);
  }
}

export async function updateNotificationSettings(req, res, next) {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const emailCategories = portalEventInternals.normalizeEmailPreferences(req.body?.emailCategories);
    let record = await SiteContent.findOne({ kind: 'portal-notification-settings', key: 'default' });
    if (record) {
      record.payload = { emailCategories };
      record.title = 'Portal operational notification settings';
      record.published = false;
      await record.save();
    } else {
      record = await SiteContent.create({
        kind: 'portal-notification-settings', key: 'default',
        title: 'Portal operational notification settings', payload: { emailCategories },
        published: false, displayOrder: 0,
      });
    }
    invalidatePortalNotificationSettingsCache();
    return res.json({ ok: true, settings: { operationalRecipient: portalEventInternals.operationalRecipient(), emailCategories } });
  } catch (error) {
    return next(error);
  }
}
