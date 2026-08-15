import Thread from '../models/Thread.js';
import { createEntityRepository } from './entity.repository.js';
import { GOOGLE_SHEET_TABS } from '../google/sheets.js';

export const threadsRepository = createEntityRepository({
  tab: GOOGLE_SHEET_TABS.threads,
  model: Thread,
});

export default threadsRepository;
