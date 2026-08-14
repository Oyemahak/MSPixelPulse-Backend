import Task from '../models/Task.js';
import { GOOGLE_SHEET_TABS } from '../google/sheets.js';
import { createEntityRepository } from './entity.repository.js';

export const tasksRepository = createEntityRepository({
  tab: GOOGLE_SHEET_TABS.tasks,
  model: Task,
  aliases: { projectId: 'project', userId: 'assignee' },
});
export default tasksRepository;

