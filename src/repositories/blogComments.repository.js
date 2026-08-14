import BlogComment from '../models/BlogComment.js';
import { GOOGLE_SHEET_TABS } from '../google/sheets.js';
import { createEntityRepository } from './entity.repository.js';

export const blogCommentsRepository = createEntityRepository({ tab: GOOGLE_SHEET_TABS.blogComments, model: BlogComment });
export default blogCommentsRepository;

