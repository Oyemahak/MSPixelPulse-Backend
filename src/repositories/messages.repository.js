import Message from '../models/Message.js';
import { GOOGLE_SHEET_TABS } from '../google/sheets.js';
import { createEntityRepository } from './entity.repository.js';

export const messagesRepository = createEntityRepository({
  tab: GOOGLE_SHEET_TABS.messages,
  model: Message,
  aliases: { projectId: 'project', roomId: 'room', threadId: 'thread', userId: 'author' },
});
export default messagesRepository;

