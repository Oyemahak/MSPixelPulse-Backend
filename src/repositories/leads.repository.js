import Lead from '../models/Lead.js';
import { GOOGLE_SHEET_TABS } from '../google/sheets.js';
import { createEntityRepository } from './entity.repository.js';

export const leadsRepository = createEntityRepository({ tab: GOOGLE_SHEET_TABS.leads, model: Lead });
export default leadsRepository;

