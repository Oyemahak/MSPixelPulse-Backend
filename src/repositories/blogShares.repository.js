import BlogShare from '../models/BlogShare.js';
import { GOOGLE_SHEET_TABS } from '../google/sheets.js';
import { createEntityRepository } from './entity.repository.js';

export const blogSharesRepository = createEntityRepository({ tab: GOOGLE_SHEET_TABS.blogShares, model: BlogShare });
export default blogSharesRepository;

