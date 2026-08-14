import { dataProviderName } from '../config/providers.js';
import { GoogleSheetsRepository } from '../google/sheets.js';
import { MongooseRepository } from './mongoose.repository.js';

/**
 * Provider-neutral repository façade. It intentionally returns stable `id`
 * strings for both stores, while preserving raw Mongo `_id` values for the
 * current controller layer.
 */
export class EntityRepository {
  constructor({ tab, model, aliases = {}, idField = 'id' }) {
    this.tab = tab;
    this.idField = idField;
    this.mongo = model ? new MongooseRepository(model, { aliases }) : null;
    this.google = new GoogleSheetsRepository(tab, { idField });
  }

  active() {
    if (dataProviderName() === 'google') return this.google;
    if (!this.mongo) {
      const error = new Error(`${this.tab} has no MongoDB fallback repository`);
      error.code = 'MONGO_REPOSITORY_UNAVAILABLE';
      error.status = 503;
      throw error;
    }
    return this.mongo;
  }

  findById(id, options) { return this.active().findById(id, options); }
  findOne(filter, options) { return this.active().findOne(filter, options); }
  list(options) { return this.active().list(options); }
  create(input) { return this.active().create(input); }
  update(id, patch) { return this.active().update(id, patch); }
  delete(id) { return this.active().delete(id); }

  findByEmail(email, options) {
    return this.findOne({ email: String(email || '').trim().toLowerCase() }, options);
  }

  findByProject(projectId, options = {}) {
    return this.list({ ...options, filter: { ...(options.filter || {}), projectId } });
  }

  findByUser(userId, options = {}) {
    return this.list({ ...options, filter: { ...(options.filter || {}), userId } });
  }
}

export function createEntityRepository(config) {
  return new EntityRepository(config);
}

