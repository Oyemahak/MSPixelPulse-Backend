import crypto from 'node:crypto';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { GOOGLE_SHEET_TABS, GoogleSheetsRepository } from '../google/sheets.js';
import { googleDrive } from '../google/drive.js';
import { googleDriveStorage } from '../storage/googleDriveStorage.js';
import { normalizeBson } from './mongoToSheets.js';

function normalizedStoragePath(value, bucket = '') {
  let raw = String(value || '').trim();
  if (!raw) return '';
  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);
      const marker = `/storage/v1/object/`;
      const index = url.pathname.indexOf(marker);
      raw = index >= 0 ? url.pathname.slice(index + marker.length) : url.pathname;
      raw = raw.replace(/^(?:sign|public|authenticated)\//, '');
    }
  } catch {
    // Retain the original path when an old stored URL is malformed.
  }
  raw = decodeURIComponent(raw.split('?')[0]).replace(/^\/+/, '');
  if (bucket && raw.startsWith(`${bucket}/`)) raw = raw.slice(bucket.length + 1);
  return raw;
}

function fileReferencePath(file, bucket) {
  if (!file || typeof file !== 'object') return '';
  return normalizedStoragePath(file.path || file.url, bucket);
}

function addReference(map, file, metadata, bucket) {
  const logicalPath = fileReferencePath(file, bucket);
  if (!logicalPath) return;
  const current = map.get(logicalPath) || {};
  map.set(logicalPath, {
    ...current,
    ...metadata,
    logicalPath,
    originalName: String(file.name || metadata.originalName || path.posix.basename(logicalPath)),
    mimeType: String(file.type || file.mime || metadata.mimeType || ''),
    declaredSize: Number(file.size || metadata.declaredSize || 0),
  });
}

export async function collectMongoFileReferences(database, bucket) {
  const [users, projects, requirements, messages, invoices, supportTickets, files] = await Promise.all([
    database.collection('users').find({}).toArray(),
    database.collection('projects').find({}).toArray(),
    database.collection('requirements').find({}).toArray(),
    database.collection('messages').find({}).toArray(),
    database.collection('invoices').find({}).toArray(),
    database.collection('supporttickets').find({}).toArray(),
    database.collection('files').find({}).toArray(),
  ]);
  const normalizedUsers = users.map(normalizeBson);
  const normalizedProjects = projects.map(normalizeBson);
  const userIds = new Set(normalizedUsers.map((user) => String(user._id)));
  const projectsById = new Map(normalizedProjects.map((project) => [String(project._id), project]));
  const references = new Map();

  for (const user of normalizedUsers) {
    addReference(references, { path: user.avatarPath, url: user.avatarUrl }, {
      userId: String(user._id), clientId: String(user._id), category: 'profile', uploadedBy: String(user._id),
    }, bucket);
  }
  for (const project of normalizedProjects) {
    const projectId = String(project._id);
    const base = { projectId, clientId: String(project.client || ''), category: 'uploads' };
    addReference(references, project.coverImage, { ...base, category: 'cover', isPublic: true }, bucket);
    for (const evidence of project.evidence || []) {
      for (const image of evidence.images || []) addReference(references, image, {
        ...base, category: 'deliverables', uploadedBy: String(evidence.author || ''),
      }, bucket);
    }
  }
  for (const source of requirements.map(normalizeBson)) {
    const base = {
      projectId: String(source.project || ''), clientId: String(source.client || ''), category: 'requirements',
    };
    addReference(references, source.logo, base, bucket);
    addReference(references, source.brief, base, bucket);
    for (const file of source.supporting || []) addReference(references, file, base, bucket);
    for (const page of source.pages || []) for (const file of page.files || []) addReference(references, file, base, bucket);
  }
  for (const source of messages.map(normalizeBson)) {
    for (const file of source.attachments || []) addReference(references, file, {
      projectId: String(source.project || ''), roomId: String(source.room || ''),
      userId: String(source.author || ''), uploadedBy: String(source.author || ''), category: 'message-attachments',
    }, bucket);
  }
  for (const source of invoices.map(normalizeBson)) addReference(references, source.file, {
    projectId: String(source.project || ''), clientId: String(source.client || ''),
    userId: String(source.uploadedBy || ''), uploadedBy: String(source.uploadedBy || ''), category: 'invoices',
  }, bucket);
  for (const source of supportTickets.map(normalizeBson)) {
    for (const reply of source.replies || []) for (const file of reply.attachments || []) addReference(references, file, {
      userId: String(reply.author || source.requester || ''), clientId: String(source.requester || ''),
      uploadedBy: String(reply.author || ''), category: 'documents',
    }, bucket);
  }
  for (const source of files.map(normalizeBson)) addReference(references, {
    path: source.path || source.url, name: source.filename, type: source.mimetype, size: source.size,
  }, {
    projectId: String(source.project || ''), userId: String(source.uploader || ''),
    uploadedBy: String(source.uploader || ''), category: 'uploads',
  }, bucket);

  return { references, projectsById, userIds };
}

export function inferFileReference(logicalPath, context) {
  const normalized = normalizedStoragePath(logicalPath, context.bucket);
  const exact = context.references.get(normalized);
  if (exact) return { ...exact };
  const segments = normalized.split('/').filter(Boolean);
  const candidateIds = segments.filter((segment) => /^[a-f\d]{24}$/i.test(segment));
  const projectId = candidateIds.find((id) => context.projectsById.has(id)) || '';
  const userId = candidateIds.find((id) => context.userIds.has(id)) || '';
  const project = context.projectsById.get(projectId);
  const lower = normalized.toLowerCase();
  const category = lower.includes('avatar') || lower.includes('profile') ? 'profile'
    : lower.includes('invoice') ? 'invoices'
      : lower.includes('requirement') || lower.includes('brief') || lower.includes('logo') ? 'requirements'
        : lower.includes('message') || lower.includes('attachment') ? 'message-attachments'
          : lower.includes('cover') ? 'cover'
            : 'uploads';
  return {
    logicalPath: normalized,
    projectId,
    clientId: String(project?.client || userId || ''),
    userId,
    uploadedBy: userId,
    category,
    isPublic: category === 'cover',
    originalName: path.posix.basename(normalized),
  };
}

async function listSupabaseObjects(client, bucket, prefix = '') {
  const collected = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.storage.from(bucket).list(prefix, {
      limit: 1000,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;
    for (const item of data || []) {
      const objectPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (!item.id && !item.metadata) collected.push(...await listSupabaseObjects(client, bucket, objectPath));
      else collected.push({
        path: objectPath,
        createdAt: item.created_at || null,
        updatedAt: item.updated_at || null,
        metadata: item.metadata || {},
      });
    }
    if (!data || data.length < 1000) break;
  }
  return collected;
}

async function streamBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export async function migrateSupabaseStorage({ database, spreadsheet } = {}) {
  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const bucket = String(process.env.SUPABASE_BUCKET || '').trim();
  if (!supabaseUrl || !serviceKey || !bucket) throw new Error('Supabase migration credentials are missing');
  const client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const objects = await listSupabaseObjects(client, bucket);
  const context = { ...(await collectMongoFileReferences(database, bucket)), bucket };
  const repository = new GoogleSheetsRepository(GOOGLE_SHEET_TABS.files, { spreadsheet });
  const existing = await repository.list({ limit: 500 });
  const existingById = new Map(existing.items.map((record) => [String(record.id), record]));
  const migrated = [];
  let totalBytes = 0;

  for (const object of objects) {
    const { data, error } = await client.storage.from(bucket).download(object.path);
    if (error) throw new Error(`Supabase object download failed: ${error.message}`);
    const buffer = Buffer.from(await data.arrayBuffer());
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const md5 = crypto.createHash('md5').update(buffer).digest('hex');
    const id = `supabase-${crypto.createHash('sha256').update(`${bucket}:${object.path}`).digest('hex').slice(0, 32)}`;
    const details = inferFileReference(object.path, context);
    const current = existingById.get(id);
    const mimeType = String(details.mimeType || object.metadata.mimetype || object.metadata.contentType || data.type || 'application/octet-stream');
    let driveFile;
    if (current?.driveFileId) {
      try {
        driveFile = await googleDrive.getMetadata(current.driveFileId);
        if (driveFile.md5Checksum !== md5 || Number(driveFile.size || 0) !== buffer.length) {
          driveFile = await googleDrive.replaceFile(current.driveFileId, {
            buffer, mimeType, name: details.originalName,
          });
        }
      } catch (cause) {
        if (Number(cause?.status || cause?.code) !== 404) throw cause;
      }
    }
    let parentDriveFolderId = String(current?.parentDriveFolderId || '');
    if (!driveFile) {
      const folder = await googleDriveStorage.folderFor(object.path, details);
      parentDriveFolderId = folder.parentId;
      driveFile = await googleDrive.uploadFile({
        name: details.originalName,
        parentId: folder.parentId,
        buffer,
        mimeType,
        appProperties: { migrationSource: 'supabase', migrationId: id },
      });
    }
    migrated.push({
      id,
      driveFileId: driveFile.id,
      parentDriveFolderId,
      logicalPath: normalizedStoragePath(object.path, bucket),
      userId: String(details.userId || ''),
      clientId: String(details.clientId || ''),
      projectId: String(details.projectId || ''),
      roomId: String(details.roomId || ''),
      originalName: String(details.originalName || path.posix.basename(object.path)),
      storedName: String(driveFile.name || details.originalName || path.posix.basename(object.path)),
      mimeType,
      size: String(buffer.length),
      category: String(details.category || 'uploads'),
      uploadedBy: String(details.uploadedBy || details.userId || ''),
      isPublic: Boolean(details.isPublic),
      sourceSha256: sha256,
      sourceMd5: md5,
      supabaseReference: { bucket, path: object.path },
      migratedFrom: 'supabase',
      createdAt: object.createdAt || current?.createdAt,
      updatedAt: object.updatedAt || current?.updatedAt,
    });
    totalBytes += buffer.length;
  }

  if (migrated.length) await repository.upsertMany(migrated);
  else await repository.ensureHeaders(['id', 'driveFileId', 'logicalPath']);
  const destination = (await repository.list({ limit: 500 })).items;
  const destinationById = new Map(destination.map((record) => [String(record.id), record]));
  const failures = [];
  let verifiedBytes = 0;
  for (const source of migrated) {
    const record = destinationById.get(source.id);
    if (!record?.driveFileId) {
      failures.push({ id: source.id, reason: 'missing-file-record' });
      continue;
    }
    try {
      const bytes = await streamBuffer(await googleDrive.downloadStream(record.driveFileId));
      const hash = crypto.createHash('sha256').update(bytes).digest('hex');
      if (bytes.length !== Number(source.size) || hash !== source.sourceSha256) {
        failures.push({ id: source.id, reason: 'byte-verification-failed' });
      } else {
        verifiedBytes += bytes.length;
      }
    } catch {
      failures.push({ id: source.id, reason: 'drive-download-failed' });
    }
  }
  return {
    sourceFileCount: objects.length,
    destinationFileCount: migrated.filter((file) => destinationById.has(file.id)).length,
    totalBytes,
    verifiedBytes,
    failures,
    files: migrated,
  };
}

export const supabaseToDriveInternals = {
  normalizedStoragePath,
};
