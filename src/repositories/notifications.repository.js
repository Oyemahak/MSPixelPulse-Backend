import NotificationLog from '../models/NotificationLog.js';
import { GOOGLE_SHEET_TABS } from '../google/sheets.js';
import { createEntityRepository } from './entity.repository.js';

export const notificationsRepository = createEntityRepository({ tab: GOOGLE_SHEET_TABS.notifications, model: NotificationLog });
export default notificationsRepository;

