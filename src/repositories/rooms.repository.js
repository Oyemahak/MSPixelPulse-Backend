import Room from '../models/Room.js';
import { GOOGLE_SHEET_TABS } from '../google/sheets.js';
import { createEntityRepository } from './entity.repository.js';

export const roomsRepository = createEntityRepository({
  tab: GOOGLE_SHEET_TABS.rooms,
  model: Room,
  aliases: { projectId: 'project' },
});
export default roomsRepository;

