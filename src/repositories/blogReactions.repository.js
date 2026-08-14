import BlogReaction from '../models/BlogReaction.js';
import { GOOGLE_SHEET_TABS } from '../google/sheets.js';
import { createEntityRepository } from './entity.repository.js';

export const blogReactionsRepository = createEntityRepository({
  tab: GOOGLE_SHEET_TABS.blogReactions,
  model: BlogReaction,
  aliases: { userId: 'user' },
});
export default blogReactionsRepository;

