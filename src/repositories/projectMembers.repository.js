import crypto from 'crypto';
import Project from '../models/Project.js';
import { dataProviderName } from '../config/providers.js';
import { GOOGLE_SHEET_TABS, GoogleSheetsRepository } from '../google/sheets.js';

export function projectMemberId(projectId, userId, role = 'member') {
  return `${String(projectId)}:${String(userId)}:${String(role)}`;
}

/**
 * MongoDB currently stores assignments on Project.client/developer. This
 * adapter exposes the same relationships as ProjectMembers without altering
 * the production schema in Phase 1.
 */
export class ProjectMembersRepository {
  constructor() {
    this.google = new GoogleSheetsRepository(GOOGLE_SHEET_TABS.projectMembers);
  }

  async findByUser(userId, { page = 1, limit = 100 } = {}) {
    if (dataProviderName() === 'google') return this.google.list({ filter: { userId: String(userId) }, page, limit });
    const projects = await Project.find({ $or: [{ client: userId }, { developer: userId }] }).select('_id client developer').lean();
    const items = projects.flatMap((project) => [
      String(project.client || '') === String(userId) ? { id: projectMemberId(project._id, userId, 'client'), projectId: String(project._id), userId: String(userId), role: 'client' } : null,
      String(project.developer || '') === String(userId) ? { id: projectMemberId(project._id, userId, 'developer'), projectId: String(project._id), userId: String(userId), role: 'developer' } : null,
    ].filter(Boolean));
    return { items, total: items.length, page, limit, hasMore: false };
  }

  async findByProject(projectId, { page = 1, limit = 100 } = {}) {
    if (dataProviderName() === 'google') return this.google.list({ filter: { projectId: String(projectId) }, page, limit });
    const project = await Project.findById(projectId).select('_id client developer').lean();
    const items = project ? [
      project.client ? { id: projectMemberId(project._id, project.client, 'client'), projectId: String(project._id), userId: String(project.client), role: 'client' } : null,
      project.developer ? { id: projectMemberId(project._id, project.developer, 'developer'), projectId: String(project._id), userId: String(project.developer), role: 'developer' } : null,
    ].filter(Boolean) : [];
    return { items, total: items.length, page, limit, hasMore: false };
  }

  async upsert({ id, projectId, userId, role = 'member', ...input }) {
    if (dataProviderName() !== 'google') {
      const field = role === 'developer' ? 'developer' : role === 'client' ? 'client' : null;
      if (!field) throw new Error('MongoDB Phase 1 supports client and developer project assignments only');
      const project = await Project.findByIdAndUpdate(projectId, { [field]: userId }, { new: true }).lean();
      return project ? { id: projectMemberId(projectId, userId, role), projectId: String(projectId), userId: String(userId), role } : null;
    }
    const memberId = id || projectMemberId(projectId, userId, role) || crypto.randomUUID();
    const existing = await this.google.findById(memberId);
    const value = { id: memberId, projectId: String(projectId), userId: String(userId), role, ...input };
    return existing ? this.google.update(memberId, value) : this.google.create(value);
  }

  async delete(id) {
    if (dataProviderName() === 'google') return this.google.delete(id);
    return false;
  }
}

export const projectMembersRepository = new ProjectMembersRepository();
export default projectMembersRepository;

