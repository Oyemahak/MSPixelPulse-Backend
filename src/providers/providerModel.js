import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { dataProviderName } from '../config/providers.js';
import { GoogleSheetsRepository } from '../google/sheets.js';

const adapters = new Map();

function idOf(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return String(value._id || value.id || '');
  return String(value);
}

function getPath(source, dotted) {
  if (dotted === '_id') return source?._id || source?.id;
  const keys = String(dotted).split('.');
  const walk = (value, index) => {
    if (index >= keys.length) return value;
    if (Array.isArray(value)) return value.flatMap((item) => {
      const resolved = walk(item, index);
      return Array.isArray(resolved) ? resolved : [resolved];
    }).filter((item) => item !== undefined);
    return walk(value?.[keys[index]], index + 1);
  };
  return walk(source, 0);
}

function setPath(target, dotted, value) {
  const keys = String(dotted).split('.');
  let cursor = target;
  for (const key of keys.slice(0, -1)) {
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[keys.at(-1)] = value;
}

function unsetPath(target, dotted) {
  const keys = String(dotted).split('.');
  const parent = keys.slice(0, -1).reduce((value, key) => value?.[key], target);
  if (parent) delete parent[keys.at(-1)];
}

function comparable(value) {
  if (value instanceof Date) return value.getTime();
  const raw = String(value ?? '');
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    const timestamp = Date.parse(raw);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return typeof value === 'number' ? value : raw;
}

function same(actual, expected) {
  if (Array.isArray(actual)) return actual.some((value) => same(value, expected));
  return idOf(actual) && idOf(expected)
    ? idOf(actual) === idOf(expected)
    : comparable(actual) === comparable(expected);
}

function regexMatches(actual, pattern, options = '') {
  const expression = pattern instanceof RegExp ? pattern : new RegExp(String(pattern), options);
  if (Array.isArray(actual)) return actual.some((value) => expression.test(String(value ?? '')));
  return expression.test(String(actual ?? ''));
}

function matchesCondition(actual, condition) {
  if (condition instanceof RegExp) return regexMatches(actual, condition);
  if (!condition || typeof condition !== 'object' || Array.isArray(condition) || condition instanceof Date) {
    return same(actual, condition);
  }
  if ('$in' in condition) return (condition.$in || []).some((value) => same(actual, value));
  if ('$nin' in condition) return !(condition.$nin || []).some((value) => same(actual, value));
  if ('$all' in condition && !(condition.$all || []).every((value) => Array.isArray(actual) && actual.some((item) => same(item, value)))) return false;
  if ('$size' in condition && (!Array.isArray(actual) || actual.length !== Number(condition.$size))) return false;
  if ('$ne' in condition && same(actual, condition.$ne)) return false;
  if ('$eq' in condition && !same(actual, condition.$eq)) return false;
  if ('$exists' in condition && Boolean(actual !== undefined && actual !== null) !== Boolean(condition.$exists)) return false;
  if ('$regex' in condition && !regexMatches(actual, condition.$regex, condition.$options || '')) return false;
  if ('$gte' in condition && comparable(actual) < comparable(condition.$gte)) return false;
  if ('$gt' in condition && comparable(actual) <= comparable(condition.$gt)) return false;
  if ('$lte' in condition && comparable(actual) > comparable(condition.$lte)) return false;
  if ('$lt' in condition && comparable(actual) >= comparable(condition.$lt)) return false;
  return true;
}

function matchesMongoFilter(record, filter = {}) {
  return Object.entries(filter || {}).every(([key, condition]) => {
    if (key === '$or') return (condition || []).some((entry) => matchesMongoFilter(record, entry));
    if (key === '$and') return (condition || []).every((entry) => matchesMongoFilter(record, entry));
    if (key === '$nor') return !(condition || []).some((entry) => matchesMongoFilter(record, entry));
    return matchesCondition(getPath(record, key), condition);
  });
}

function compareRecords(spec = {}) {
  const entries = Object.entries(spec || {});
  return (left, right) => {
    for (const [field, direction] of entries) {
      const a = comparable(getPath(left, field));
      const b = comparable(getPath(right, field));
      if (a < b) return Number(direction) < 0 ? 1 : -1;
      if (a > b) return Number(direction) < 0 ? -1 : 1;
    }
    return 0;
  };
}

function selectedRecord(record, selection) {
  if (!selection) return { ...record };
  const tokens = typeof selection === 'string'
    ? selection.split(/\s+/).filter(Boolean)
    : Object.entries(selection).map(([key, value]) => `${value ? '' : '-'}${key}`);
  const included = tokens.filter((token) => !token.startsWith('-')).map((token) => token.replace(/^\+/, ''));
  if (included.length) {
    const result = { id: record.id, _id: record._id || record.id };
    for (const key of included) {
      const value = getPath(record, key);
      if (value !== undefined) setPath(result, key, value);
    }
    return result;
  }
  const result = { ...record };
  for (const token of tokens.filter((value) => value.startsWith('-'))) unsetPath(result, token.slice(1));
  return result;
}

function hydrateDates(value, key = '') {
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map((item) => hydrateDates(item, key));
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && /(At|Date|Time)$/.test(key) && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return date;
    }
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([childKey, item]) => [childKey, hydrateDates(item, childKey)]));
}

function plainDocument(value) {
  if (!value) return value;
  const source = typeof value.toObject === 'function' ? value.toObject() : value;
  return hydrateDates({ ...source, id: String(source.id || source._id), _id: String(source._id || source.id) });
}

function updateValue(record, update = {}, { isInsert = false } = {}) {
  const next = structuredClone(record || {});
  const operatorUpdate = Object.keys(update || {}).some((key) => key.startsWith('$'));
  if (!operatorUpdate) return { ...next, ...update };
  if (isInsert) for (const [key, value] of Object.entries(update.$setOnInsert || {})) setPath(next, key, value);
  for (const [key, value] of Object.entries(update.$set || {})) setPath(next, key, value);
  for (const key of Object.keys(update.$unset || {})) unsetPath(next, key);
  for (const [key, value] of Object.entries(update.$inc || {})) setPath(next, key, Number(getPath(next, key) || 0) + Number(value || 0));
  for (const [key, value] of Object.entries(update.$push || {})) {
    const current = Array.isArray(getPath(next, key)) ? [...getPath(next, key)] : [];
    if (value && typeof value === 'object' && '$each' in value) {
      const position = Number.isInteger(value.$position) ? value.$position : current.length;
      current.splice(position, 0, ...(value.$each || []));
    } else current.push(value);
    setPath(next, key, current);
  }
  for (const [key, value] of Object.entries(update.$addToSet || {})) {
    const current = Array.isArray(getPath(next, key)) ? [...getPath(next, key)] : [];
    const incoming = value && typeof value === 'object' && '$each' in value ? value.$each : [value];
    for (const item of incoming || []) if (!current.some((existing) => same(existing, item))) current.push(item);
    setPath(next, key, current);
  }
  for (const [key, value] of Object.entries(update.$pull || {})) {
    const current = Array.isArray(getPath(next, key)) ? getPath(next, key) : [];
    setPath(next, key, current.filter((item) => !matchesCondition(item, value)));
  }
  return next;
}

function simpleSlug(value) {
  return String(value || '').toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

class ProviderDocument {
  constructor(adapter, value = {}, { isNew = false } = {}) {
    Object.defineProperty(this, '__adapter', { value: adapter, enumerable: false, writable: false });
    Object.defineProperty(this, 'isNew', { value: isNew, enumerable: false, writable: true });
    Object.assign(this, hydrateDates(value));
    if (this.id || this._id) {
      this.id = String(this.id || this._id);
      this._id = String(this._id || this.id);
    }
  }

  set(value = {}) { Object.assign(this, hydrateDates(value)); return this; }
  toObject() {
    return Object.fromEntries(Object.entries(this).map(([key, value]) => [key, value]));
  }
  toJSON() { return this.toObject(); }
  async save() {
    const saved = await this.__adapter.save(this.toObject(), { isNew: this.isNew });
    for (const key of Object.keys(this)) delete this[key];
    Object.assign(this, hydrateDates(saved));
    this.isNew = false;
    return this;
  }
  async deleteOne() {
    const deleted = await this.__adapter.repository.delete(this.id || this._id);
    return { deletedCount: deleted ? 1 : 0 };
  }
  async populate(input, select) {
    const populated = await this.__adapter.populateRecord(this.toObject(), [{ input, select }]);
    Object.assign(this, populated);
    return this;
  }
}

class GoogleQuery {
  constructor(executor, adapter) {
    this.executor = executor;
    this.adapter = adapter;
    this.sortSpec = null;
    this.selection = null;
    this.skipCount = 0;
    this.limitCount = null;
    this.populateRequests = [];
    this.asLean = false;
  }
  sort(spec) { this.sortSpec = spec; return this; }
  select(spec) { this.selection = spec; return this; }
  skip(value) { this.skipCount = Math.max(0, Number(value) || 0); return this; }
  limit(value) { this.limitCount = Math.max(0, Number(value) || 0); return this; }
  populate(input, select) { this.populateRequests.push({ input, select }); return this; }
  lean() { this.asLean = true; return this; }
  session() { return this; }
  async exec() {
    const result = await this.executor();
    const mapOne = async (value) => {
      if (!value) return value;
      let record = selectedRecord(plainDocument(value), this.selection);
      record = await this.adapter.populateRecord(record, this.populateRequests);
      return this.asLean ? record : new ProviderDocument(this.adapter, record);
    };
    if (!Array.isArray(result)) return mapOne(result);
    let values = result.map(plainDocument);
    if (this.sortSpec) values.sort(compareRecords(this.sortSpec));
    if (this.skipCount) values = values.slice(this.skipCount);
    if (this.limitCount !== null) values = values.slice(0, this.limitCount);
    return Promise.all(values.map(mapOne));
  }
  then(resolve, reject) { return this.exec().then(resolve, reject); }
  catch(reject) { return this.exec().catch(reject); }
  finally(handler) { return this.exec().finally(handler); }
}

function aggregateExpression(expression, record) {
  if (typeof expression === 'string' && expression.startsWith('$')) return getPath(record, expression.slice(1));
  if (!expression || typeof expression !== 'object') return expression;
  if ('$eq' in expression) return same(aggregateExpression(expression.$eq[0], record), aggregateExpression(expression.$eq[1], record));
  if ('$cond' in expression) return aggregateExpression(expression.$cond[0], record)
    ? aggregateExpression(expression.$cond[1], record)
    : aggregateExpression(expression.$cond[2], record);
  return expression;
}

class GoogleModelAdapter {
  constructor({ modelName, tab, relations = {}, unique = [], defaults = {} }) {
    this.modelName = modelName;
    this.tab = tab;
    this.relations = relations;
    this.unique = unique;
    this.defaults = defaults;
    this.repository = new GoogleSheetsRepository(tab);
    adapters.set(modelName, this);
  }

  async all() {
    const records = [];
    for (let page = 1; ; page += 1) {
      const result = await this.repository.list({ page, limit: 500 });
      records.push(...result.items);
      if (!result.hasMore) break;
    }
    return records.filter((record) => !record.migrationTombstone);
  }

  async find(filter = {}) { return (await this.all()).filter((record) => matchesMongoFilter(record, filter)); }
  async findOne(filter = {}) { return (await this.find(filter))[0] || null; }
  async findById(id) {
    const record = await this.repository.findById(id);
    return record?.migrationTombstone ? null : record;
  }

  async prepare(value, current = null) {
    const now = new Date().toISOString();
    const evaluatedDefaults = Object.fromEntries(Object.entries(this.defaults).map(([key, item]) => [
      key, typeof item === 'function' ? item() : structuredClone(item),
    ]));
    const record = {
      ...evaluatedDefaults,
      ...(current || {}),
      ...value,
      id: String(value.id || value._id || current?.id || current?._id || crypto.randomUUID()),
    };
    record._id = record.id;
    if (this.modelName === 'User') {
      record.email = String(record.email || '').trim().toLowerCase();
      if (record.password) {
        record.passwordHash = String(record.password).startsWith('$2')
          ? String(record.password)
          : await bcrypt.hash(String(record.password), 10);
        delete record.password;
        record.passwordChangedAt = now;
        record.authVersion = current ? Number(current.authVersion || 0) + 1 : Number(record.authVersion || 0);
      }
      record.status = record.status || record.accountStatus || 'pending';
      record.accountStatus = record.accountStatus || record.status;
      record.applicationStatus = record.applicationStatus || record.accessApplication?.status || 'pending';
    }
    if (this.modelName === 'Project' && !record.slug) {
      const base = simpleSlug(record.title) || `project-${record.id}`;
      let slug = base;
      let sequence = 1;
      while ((await this.find({ slug })).some((item) => item.id !== record.id)) {
        sequence += 1;
        slug = `${base}-${sequence}`;
      }
      record.slug = slug;
    }
    return record;
  }

  async assertUnique(record) {
    for (const fields of this.unique) {
      const filter = Object.fromEntries(fields.map((field) => [field, getPath(record, field)]));
      if (Object.values(filter).some((value) => value === '' || value === null || value === undefined)) continue;
      const duplicate = (await this.find(filter)).find((item) => item.id !== record.id);
      if (duplicate) {
        const error = new Error(`Duplicate ${this.modelName} record`);
        error.code = 11000;
        throw error;
      }
    }
  }

  async save(value, { isNew = false } = {}) {
    const id = idOf(value);
    const current = id ? await this.repository.findById(id) : null;
    const prepared = await this.prepare(value, current);
    await this.assertUnique(prepared);
    return current && !isNew
      ? this.repository.update(prepared.id, prepared)
      : this.repository.create(prepared);
  }

  async populateRecord(record, requests = []) {
    const result = { ...record };
    for (const request of requests) {
      const entries = Array.isArray(request.input) ? request.input : [
        typeof request.input === 'string' ? { path: request.input, select: request.select } : request.input,
      ];
      for (const entry of entries.filter(Boolean)) {
        const relation = this.relations[entry.path];
        const relatedAdapter = relation ? adapters.get(relation) : null;
        if (!relatedAdapter) continue;
        const current = getPath(result, entry.path);
        if (Array.isArray(current)) {
          const populated = [];
          for (const value of current) {
            const found = await relatedAdapter.findById(idOf(value));
            if (found) populated.push(selectedRecord(plainDocument(found), entry.select));
          }
          setPath(result, entry.path, populated);
        } else if (current) {
          const found = await relatedAdapter.findById(idOf(current));
          setPath(result, entry.path, found ? selectedRecord(plainDocument(found), entry.select) : null);
        }
      }
    }
    return result;
  }

  queryFind(filter = {}) { return new GoogleQuery(() => this.find(filter), this); }
  queryFindOne(filter = {}) { return new GoogleQuery(() => this.findOne(filter), this); }
  queryFindById(id) { return new GoogleQuery(() => this.findById(id), this); }
  queryCreate(input) {
    return this.save(input, { isNew: true }).then((record) => new ProviderDocument(this, record));
  }
  queryUpdate(filter, update, options = {}) {
    return new GoogleQuery(async () => {
      let current = await this.findOne(filter);
      const isInsert = !current;
      if (!current && options.upsert) {
        current = Object.fromEntries(Object.entries(filter).filter(([key, value]) => !key.startsWith('$') && (typeof value !== 'object' || value instanceof Date)));
      }
      if (!current) return null;
      const next = updateValue(current, update, { isInsert });
      return this.save(next, { isNew: !idOf(current) });
    }, this);
  }
  queryDelete(filter) {
    return new GoogleQuery(async () => {
      const current = await this.findOne(filter);
      if (!current) return null;
      await this.repository.delete(current.id);
      return current;
    }, this);
  }
  async deleteMany(filter = {}) {
    const matches = await this.find(filter);
    const deletedCount = await this.repository.deleteMany(matches.map((record) => record.id));
    return { acknowledged: true, deletedCount };
  }
  async updateMany(filter = {}, update = {}) {
    const matches = await this.find(filter);
    for (const record of matches) await this.save(updateValue(record, update));
    return { acknowledged: true, matchedCount: matches.length, modifiedCount: matches.length };
  }
  async countDocuments(filter = {}) { return (await this.find(filter)).length; }
  async aggregate(pipeline = []) {
    let values = await this.all();
    for (const stage of pipeline) {
      if (stage.$match) values = values.filter((record) => matchesMongoFilter(record, stage.$match));
      if (stage.$group) {
        const groups = new Map();
        for (const record of values) {
          const key = aggregateExpression(stage.$group._id, record);
          const current = groups.get(String(key)) || { _id: key };
          for (const [field, accumulator] of Object.entries(stage.$group)) {
            if (field === '_id') continue;
            if ('$last' in accumulator) current[field] = aggregateExpression(accumulator.$last, record);
            if ('$sum' in accumulator) current[field] = Number(current[field] || 0) + Number(aggregateExpression(accumulator.$sum, record) || 0);
          }
          groups.set(String(key), current);
        }
        values = [...groups.values()];
      }
      if (stage.$sort) values.sort(compareRecords(stage.$sort));
      if (stage.$limit) values = values.slice(0, Number(stage.$limit));
    }
    return values;
  }
}

export function createProviderModel(mongooseModel, config) {
  const adapter = new GoogleModelAdapter(config);
  const googleMethods = {
    find: (filter) => adapter.queryFind(filter),
    findOne: (filter) => adapter.queryFindOne(filter),
    findById: (id) => adapter.queryFindById(id),
    create: (input) => adapter.queryCreate(input),
    findByIdAndUpdate: (id, update, options) => adapter.queryUpdate({ _id: id }, update, options),
    findOneAndUpdate: (filter, update, options) => adapter.queryUpdate(filter, update, options),
    findByIdAndDelete: (id) => adapter.queryDelete({ _id: id }),
    findOneAndDelete: (filter) => adapter.queryDelete(filter),
    deleteOne: async (filter) => {
      const deleted = await adapter.queryDelete(filter);
      return { acknowledged: true, deletedCount: deleted ? 1 : 0 };
    },
    deleteMany: (filter) => adapter.deleteMany(filter),
    updateMany: (filter, update) => adapter.updateMany(filter, update),
    countDocuments: (filter) => adapter.countDocuments(filter),
    exists: async (filter) => Boolean(await adapter.findOne(filter)),
    aggregate: (pipeline) => adapter.aggregate(pipeline),
  };
  return new Proxy(mongooseModel, {
    construct(target, args) {
      if (dataProviderName() !== 'google') return Reflect.construct(target, args, target);
      return new ProviderDocument(adapter, args[0] || {}, { isNew: true });
    },
    get(target, property, receiver) {
      if (dataProviderName() === 'google' && property in googleMethods) return googleMethods[property];
      return Reflect.get(target, property, receiver);
    },
  });
}

export const providerModelInternals = {
  hydrateDates,
  matchesMongoFilter,
  selectedRecord,
  updateValue,
};
