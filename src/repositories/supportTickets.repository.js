import SupportTicket from '../models/SupportTicket.js';
import { createEntityRepository } from './entity.repository.js';
import { GOOGLE_SHEET_TABS } from '../google/sheets.js';

export const supportTicketsRepository = createEntityRepository({
  tab: GOOGLE_SHEET_TABS.supportTickets,
  model: SupportTicket,
});

export default supportTicketsRepository;
