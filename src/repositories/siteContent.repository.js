import SiteContent from '../models/SiteContent.js';
import { GOOGLE_SHEET_TABS } from '../google/sheets.js';
import { createEntityRepository } from './entity.repository.js';

export const siteContentRepository = createEntityRepository({ tab: GOOGLE_SHEET_TABS.siteContent, model: SiteContent });
export default siteContentRepository;

