import { Router } from 'express';
import { requireAuth } from '../../../middleware/auth.js';
import {
  getNotificationSettings,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationSettings,
} from '../controllers/notification.controller.js';

const router = Router();

router.get('/', requireAuth, listNotifications);
router.patch('/read-all', requireAuth, markAllNotificationsRead);
router.patch('/:notificationId/read', requireAuth, markNotificationRead);
router.get('/settings/operational', requireAuth, getNotificationSettings);
router.patch('/settings/operational', requireAuth, updateNotificationSettings);

export default router;
