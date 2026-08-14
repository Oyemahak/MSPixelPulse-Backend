import Requirement from '../models/Requirement.js';
import { GOOGLE_SHEET_TABS } from '../google/sheets.js';
import { createEntityRepository } from './entity.repository.js';

export const requirementsRepository = createEntityRepository({
  tab: GOOGLE_SHEET_TABS.requirements,
  model: Requirement,
  aliases: { projectId: 'project', clientId: 'client' },
});
export default requirementsRepository;

