function plain(document) {
  if (!document) return null;
  const value = document.toObject ? document.toObject() : document;
  return { ...value, id: String(value._id || value.id) };
}

function mongoFilter(filter = {}, aliases = {}) {
  return Object.fromEntries(Object.entries(filter || {}).map(([key, value]) => [aliases[key] || key, value]));
}

/** Minimal Mongo adapter used only by the provider repositories. Existing
 * controllers retain their current Mongoose paths during Phase 1. */
export class MongooseRepository {
  constructor(model, { aliases = {} } = {}) {
    this.model = model;
    this.aliases = aliases;
  }

  async findById(id, { select } = {}) {
    const query = this.model.findById(id);
    if (select) query.select(select);
    return plain(await query.lean());
  }

  async findOne(filter = {}, { select } = {}) {
    const query = this.model.findOne(mongoFilter(filter, this.aliases));
    if (select) query.select(select);
    return plain(await query.lean());
  }

  async list({ filter = {}, page = 1, limit = 100, sort = { createdAt: -1 }, select } = {}) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(500, Math.max(1, Number(limit) || 100));
    const query = mongoFilter(filter, this.aliases);
    const [items, total] = await Promise.all([
      this.model.find(query).sort(sort).skip((safePage - 1) * safeLimit).limit(safeLimit).select(select || '').lean(),
      this.model.countDocuments(query),
    ]);
    return {
      items: items.map(plain),
      total,
      page: safePage,
      limit: safeLimit,
      hasMore: safePage * safeLimit < total,
    };
  }

  async create(input = {}) {
    const payload = { ...input };
    if (payload.id && !payload._id) payload._id = payload.id;
    delete payload.id;
    return plain(await this.model.create(payload));
  }

  async update(id, patch = {}) {
    const payload = { ...patch };
    delete payload.id;
    return plain(await this.model.findByIdAndUpdate(id, payload, { new: true, runValidators: true }).lean());
  }

  async delete(id) {
    const result = await this.model.deleteOne({ _id: id });
    return result.deletedCount === 1;
  }
}

