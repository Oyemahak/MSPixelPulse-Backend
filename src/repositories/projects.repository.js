import Project from '../models/Project.js';
import { dataProviderName } from '../config/providers.js';
import { GOOGLE_SHEET_TABS, GoogleSheetsRepository } from '../google/sheets.js';
import { MongooseRepository } from './mongoose.repository.js';
import { projectMembersRepository } from './projectMembers.repository.js';

export class ProjectsRepository {
  constructor() {
    this.google = new GoogleSheetsRepository(GOOGLE_SHEET_TABS.projects);
    this.mongo = new MongooseRepository(Project, { aliases: { clientId: 'client', developerId: 'developer' } });
  }

  active() { return dataProviderName() === 'google' ? this.google : this.mongo; }
  findById(id, options) { return this.active().findById(id, options); }
  findOne(filter, options) { return this.active().findOne(filter, options); }
  list(options) { return this.active().list(options); }
  create(input) { return this.active().create(input); }
  update(id, patch) { return this.active().update(id, patch); }
  delete(id) { return this.active().delete(id); }

  async listForUser(user, options = {}) {
    if (user?.role === 'admin') return this.list(options);
    if (dataProviderName() === 'mongodb') {
      const field = user?.role === 'developer' ? 'developer' : 'client';
      return this.list({ ...options, filter: { ...(options.filter || {}), [field]: user?._id || user?.id } });
    }
    const memberships = await projectMembersRepository.findByUser(user?.id || user?._id, { limit: 500 });
    const ids = memberships.items
      .filter((member) => ['client', 'developer', 'owner'].includes(member.role || user?.role))
      .map((member) => member.projectId);
    const owned = await this.list({ ...options, filter: (project) => {
      const userId = String(user?.id || user?._id || '');
      return ids.includes(project.id) || String(project.clientId || project.client || '') === userId || String(project.developerId || project.developer || '') === userId;
    } });
    return owned;
  }
}

export const projectsRepository = new ProjectsRepository();
export default projectsRepository;

