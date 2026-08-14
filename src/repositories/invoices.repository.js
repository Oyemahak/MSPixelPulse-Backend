import Invoice from '../models/Invoice.js';
import { GOOGLE_SHEET_TABS } from '../google/sheets.js';
import { createEntityRepository } from './entity.repository.js';

export const invoicesRepository = createEntityRepository({
  tab: GOOGLE_SHEET_TABS.invoices,
  model: Invoice,
  aliases: { projectId: 'project', clientId: 'client', userId: 'uploadedBy' },
});
export default invoicesRepository;

