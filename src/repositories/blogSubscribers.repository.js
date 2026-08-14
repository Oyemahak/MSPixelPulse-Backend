import BlogSubscriber from '../models/BlogSubscriber.js';
import { GOOGLE_SHEET_TABS } from '../google/sheets.js';
import { createEntityRepository } from './entity.repository.js';

export const blogSubscribersRepository = createEntityRepository({ tab: GOOGLE_SHEET_TABS.blogSubscribers, model: BlogSubscriber });
export default blogSubscribersRepository;

