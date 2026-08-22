import Receipt from '../models/Receipt.js';
import { createEntityRepository } from './entity.repository.js';
import { GOOGLE_SHEET_TABS } from '../google/sheets.js';

export const receiptsRepository = createEntityRepository({ tab: GOOGLE_SHEET_TABS.receipts, model: Receipt });
export default receiptsRepository;
