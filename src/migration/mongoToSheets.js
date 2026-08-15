import { GOOGLE_SHEET_TABS, GoogleSheetsRepository } from '../google/sheets.js';
import { projectMemberId } from '../repositories/projectMembers.repository.js';

export const MONGO_COLLECTION_SHEETS = Object.freeze([
  ['users', GOOGLE_SHEET_TABS.users],
  ['projects', GOOGLE_SHEET_TABS.projects],
  ['requirements', GOOGLE_SHEET_TABS.requirements],
  ['rooms', GOOGLE_SHEET_TABS.rooms],
  ['threads', GOOGLE_SHEET_TABS.threads],
  ['messages', GOOGLE_SHEET_TABS.messages],
  ['invoices', GOOGLE_SHEET_TABS.invoices],
  ['files', GOOGLE_SHEET_TABS.files],
  ['leads', GOOGLE_SHEET_TABS.leads],
  ['tasks', GOOGLE_SHEET_TABS.tasks],
  ['notificationlogs', GOOGLE_SHEET_TABS.notifications],
  ['blogcomments', GOOGLE_SHEET_TABS.blogComments],
  ['blogreactions', GOOGLE_SHEET_TABS.blogReactions],
  ['blogshares', GOOGLE_SHEET_TABS.blogShares],
  ['blogsubscribers', GOOGLE_SHEET_TABS.blogSubscribers],
  ['sitecontents', GOOGLE_SHEET_TABS.siteContent],
  ['supporttickets', GOOGLE_SHEET_TABS.supportTickets],
]);

export function normalizeBson(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (Array.isArray(value)) return value.map(normalizeBson);
  if (value instanceof Map) {
    return Object.fromEntries([...value.entries()].map(([key, item]) => [key, normalizeBson(item)]));
  }
  if (typeof value !== 'object') return value;
  if (value._bsontype === 'ObjectId') return String(value.toHexString?.() || value);
  if (value._bsontype === 'Decimal128') return String(value.toString());
  if (value._bsontype === 'Binary') {
    const bytes = value.value?.() || value.buffer;
    return Buffer.from(bytes || '').toString('base64');
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeBson(item)]));
}

function relationshipAliases(collection, record) {
  const aliases = {
    projects: { clientId: 'client', developerId: 'developer' },
    requirements: { projectId: 'project', clientId: 'client' },
    rooms: { projectId: 'project' },
    messages: { projectId: 'project', roomId: 'room', threadId: 'thread', authorId: 'author', userId: 'author' },
    invoices: { projectId: 'project', clientId: 'client', uploadedById: 'uploadedBy', userId: 'uploadedBy' },
    files: { projectId: 'project', uploadedBy: 'uploader', uploaderId: 'uploader', userId: 'uploader' },
    tasks: { projectId: 'project', assigneeId: 'assignee', userId: 'assignee' },
    blogreactions: { userId: 'user' },
    supporttickets: { requesterId: 'requester', userId: 'requester' },
  }[collection] || {};
  for (const [alias, source] of Object.entries(aliases)) {
    if (record[source] !== undefined && record[source] !== null) record[alias] = String(record[source]);
  }
  return record;
}

export function mongoDocumentToSheetRecord(collection, document) {
  const normalized = normalizeBson(document);
  const id = String(normalized?._id || '').trim();
  if (!id) throw new Error(`MongoDB ${collection} record is missing _id`);
  const record = relationshipAliases(collection, { ...normalized, id, _id: id });
  if (collection === 'users') {
    record.passwordHash = String(record.password || record.passwordHash || '');
    delete record.password;
    record.email = String(record.email || '').trim().toLowerCase();
    record.accountStatus = String(record.accountStatus || record.status || 'pending');
    record.status = String(record.status || record.accountStatus || 'pending');
    record.applicationStatus = String(record.accessApplication?.status || record.applicationStatus || 'pending');
  }
  return record;
}

export function deriveProjectMembers(projects = []) {
  return projects.flatMap((project) => [
    project.clientId || project.client
      ? {
        id: projectMemberId(project.id, project.clientId || project.client, 'client'),
        projectId: String(project.id),
        userId: String(project.clientId || project.client),
        role: 'client',
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      }
      : null,
    project.developerId || project.developer
      ? {
        id: projectMemberId(project.id, project.developerId || project.developer, 'developer'),
        projectId: String(project.id),
        userId: String(project.developerId || project.developer),
        role: 'developer',
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      }
      : null,
  ].filter(Boolean));
}

export async function loadMongoSheetDataset(database) {
  const dataset = new Map();
  for (const [collection, tab] of MONGO_COLLECTION_SHEETS) {
    const documents = await database.collection(collection).find({}).toArray();
    dataset.set(tab, documents.map((document) => mongoDocumentToSheetRecord(collection, document)));
  }
  dataset.set(GOOGLE_SHEET_TABS.projectMembers, deriveProjectMembers(dataset.get(GOOGLE_SHEET_TABS.projects)));
  return dataset;
}

function presentIds(records = []) {
  return records.map((record) => String(record.id || '')).filter(Boolean);
}

export function compareTabRecords(source = [], destination = []) {
  const sourceIds = presentIds(source);
  const destinationIds = presentIds(destination);
  const duplicateSourceIds = sourceIds.filter((id, index) => sourceIds.indexOf(id) !== index);
  const duplicateDestinationIds = destinationIds.filter((id, index) => destinationIds.indexOf(id) !== index);
  const sourceSet = new Set(sourceIds);
  const destinationSet = new Set(destinationIds);
  return {
    sourceCount: source.length,
    destinationCount: destination.length,
    missingIds: [...sourceSet].filter((id) => !destinationSet.has(id)),
    extraIds: [...destinationSet].filter((id) => !sourceSet.has(id)),
    duplicateSourceIds: [...new Set(duplicateSourceIds)],
    duplicateDestinationIds: [...new Set(duplicateDestinationIds)],
  };
}

function relation(orphaned, sourceTab, sourceId, field, targetTab, targetId, validIds) {
  const value = String(targetId || '').trim();
  if (value && !validIds.has(value)) orphaned.push({ sourceTab, sourceId, field, targetTab, targetId: value });
}

export function validateDatasetRelationships(dataset) {
  const ids = Object.fromEntries([...dataset.entries()].map(([tab, records]) => [tab, new Set(presentIds(records))]));
  const orphaned = [];
  const users = ids[GOOGLE_SHEET_TABS.users] || new Set();
  const projects = ids[GOOGLE_SHEET_TABS.projects] || new Set();
  const rooms = ids[GOOGLE_SHEET_TABS.rooms] || new Set();
  const threads = ids[GOOGLE_SHEET_TABS.threads] || new Set();

  for (const record of dataset.get(GOOGLE_SHEET_TABS.projects) || []) {
    relation(orphaned, 'Projects', record.id, 'clientId', 'Users', record.clientId || record.client, users);
    relation(orphaned, 'Projects', record.id, 'developerId', 'Users', record.developerId || record.developer, users);
  }
  for (const record of dataset.get(GOOGLE_SHEET_TABS.projectMembers) || []) {
    relation(orphaned, 'ProjectMembers', record.id, 'projectId', 'Projects', record.projectId, projects);
    relation(orphaned, 'ProjectMembers', record.id, 'userId', 'Users', record.userId, users);
  }
  for (const record of dataset.get(GOOGLE_SHEET_TABS.requirements) || []) {
    relation(orphaned, 'Requirements', record.id, 'projectId', 'Projects', record.projectId || record.project, projects);
    relation(orphaned, 'Requirements', record.id, 'clientId', 'Users', record.clientId || record.client, users);
  }
  for (const record of dataset.get(GOOGLE_SHEET_TABS.rooms) || []) {
    relation(orphaned, 'Rooms', record.id, 'projectId', 'Projects', record.projectId || record.project, projects);
  }
  for (const record of dataset.get(GOOGLE_SHEET_TABS.threads) || []) {
    for (const participant of record.participants || []) relation(orphaned, 'Threads', record.id, 'participants', 'Users', participant, users);
  }
  for (const record of dataset.get(GOOGLE_SHEET_TABS.messages) || []) {
    relation(orphaned, 'Messages', record.id, 'projectId', 'Projects', record.projectId || record.project, projects);
    relation(orphaned, 'Messages', record.id, 'roomId', 'Rooms', record.roomId || record.room, rooms);
    relation(orphaned, 'Messages', record.id, 'threadId', 'Threads', record.threadId || record.thread, threads);
    relation(orphaned, 'Messages', record.id, 'authorId', 'Users', record.authorId || record.author, users);
    for (const reader of record.readBy || []) relation(orphaned, 'Messages', record.id, 'readBy', 'Users', reader, users);
  }
  for (const tab of [GOOGLE_SHEET_TABS.invoices, GOOGLE_SHEET_TABS.files, GOOGLE_SHEET_TABS.tasks]) {
    for (const record of dataset.get(tab) || []) {
      relation(orphaned, tab, record.id, 'projectId', 'Projects', record.projectId || record.project, projects);
      relation(orphaned, tab, record.id, 'userId', 'Users', record.userId || record.clientId || record.client || record.assignee || record.uploader, users);
    }
  }
  for (const record of dataset.get(GOOGLE_SHEET_TABS.supportTickets) || []) {
    relation(orphaned, 'SupportTickets', record.id, 'requesterId', 'Users', record.requesterId || record.requester, users);
    for (const reply of record.replies || []) relation(orphaned, 'SupportTickets', record.id, 'replies.author', 'Users', reply.author, users);
  }
  return orphaned;
}

/**
 * Historical Mongo records can legitimately outlive accounts/projects that
 * were hard-deleted before cascade protection existed. Preserve that history
 * with deterministic, non-login tombstones instead of dropping the records or
 * silently clearing their original relationship IDs.
 */
export function recoverHistoricalReferences(dataset) {
  const before = validateDatasetRelationships(dataset);
  const timestamp = '1970-01-01T00:00:00.000Z';
  const users = dataset.get(GOOGLE_SHEET_TABS.users) || [];
  const projects = dataset.get(GOOGLE_SHEET_TABS.projects) || [];
  const userIds = new Set(presentIds(users));
  const projectIds = new Set(presentIds(projects));
  const recoveredUsers = [];
  const recoveredProjects = [];

  for (const orphan of before) {
    if (orphan.targetTab === GOOGLE_SHEET_TABS.users && !userIds.has(orphan.targetId)) {
      const record = {
        id: orphan.targetId,
        _id: orphan.targetId,
        name: 'Deleted account',
        email: `deleted+${orphan.targetId}@invalid.mspixelpulse.local`,
        passwordHash: '',
        role: 'client',
        status: 'suspended',
        accountStatus: 'suspended',
        applicationStatus: 'declined',
        accessApplication: { status: 'declined', requestedRole: 'client' },
        authVersion: 1,
        migrationTombstone: true,
        deletedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      users.push(record);
      recoveredUsers.push(record.id);
      userIds.add(record.id);
    }
    if (orphan.targetTab === GOOGLE_SHEET_TABS.projects && !projectIds.has(orphan.targetId)) {
      const record = {
        id: orphan.targetId,
        _id: orphan.targetId,
        title: 'Archived project record',
        slug: `archived-project-${orphan.targetId}`,
        status: 'archived',
        projectClassification: 'technical',
        published: false,
        featured: false,
        migrationTombstone: true,
        deletedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      projects.push(record);
      recoveredProjects.push(record.id);
      projectIds.add(record.id);
    }
  }

  dataset.set(GOOGLE_SHEET_TABS.users, users);
  dataset.set(GOOGLE_SHEET_TABS.projects, projects);
  return {
    recoveredUsers,
    recoveredProjects,
    unresolved: validateDatasetRelationships(dataset),
  };
}

export async function migrateDatasetToSheets(dataset, { spreadsheet } = {}) {
  const results = {};
  for (const tab of Object.values(GOOGLE_SHEET_TABS)) {
    const records = dataset.get(tab) || [];
    const repository = new GoogleSheetsRepository(tab, { spreadsheet });
    if (records.length) await repository.upsertMany(records);
    else await repository.ensureHeaders(['id', 'createdAt', 'updatedAt']);
    const destination = (await repository.list({ limit: 500 })).items;
    const comparableDestination = tab === GOOGLE_SHEET_TABS.files
      ? destination.filter((record) => record.migratedFrom !== 'supabase')
      : destination;
    results[tab] = {
      ...compareTabRecords(records, comparableDestination),
      ...(tab === GOOGLE_SHEET_TABS.files
        ? { externalStorageRecordsPreserved: destination.length - comparableDestination.length }
        : {}),
    };
  }
  return results;
}

export function migrationPassed(results, orphaned = []) {
  return orphaned.length === 0 && Object.values(results).every((result) => (
    result.sourceCount === result.destinationCount
    && result.missingIds.length === 0
    && result.extraIds.length === 0
    && result.duplicateSourceIds.length === 0
    && result.duplicateDestinationIds.length === 0
  ));
}
