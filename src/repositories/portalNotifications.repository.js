import PortalNotification from '../models/PortalNotification.js';
import { createEntityRepository } from './entity.repository.js';
import { GOOGLE_SHEET_TABS } from '../google/sheets.js';

export const portalNotificationsRepository = createEntityRepository({
  tab: GOOGLE_SHEET_TABS.portalNotifications,
  model: PortalNotification,
});

export default portalNotificationsRepository;
