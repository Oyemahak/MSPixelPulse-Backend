import crypto from 'crypto';
import path from 'path';
import { googleDrive, googleDriveRoots } from '../google/drive.js';
import { googleFilesRepository } from '../repositories/files.repository.js';
import { signDriveFileAccess } from './fileAccessToken.js';

function publicApiBase() {
  const configured = String(
    process.env.API_PUBLIC_BASE || process.env.RENDER_EXTERNAL_URL || process.env.VERCEL_URL || '',
  ).trim();
  if (configured) return configured.startsWith('http') ? configured.replace(/\/$/, '') : `https://${configured.replace(/\/$/, '')}`;
  return `http://localhost:${process.env.PORT || 4000}`;
}

function cleanSegment(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120) || 'unassigned';
}

function logicalFileDetails(logicalPath, metadata = {}) {
  const pieces = String(logicalPath || '').split('/').filter(Boolean);
  if (pieces[0] === 'avatars') {
    const userId = String(metadata.userId || metadata.clientId || pieces[1] || '');
    return {
      kind: 'client',
      userId,
      clientId: String(metadata.clientId || userId || ''),
      category: metadata.category || 'profile',
      storedName: pieces.at(-1) || 'upload.bin',
    };
  }
  if (pieces[0] === 'projects') {
    const projectId = String(metadata.projectId || pieces[1] || '');
    const purpose = String(metadata.category || pieces[2] || 'uploads').toLowerCase();
    return {
      kind: 'project',
      projectId,
      clientId: String(metadata.clientId || ''),
      userId: String(metadata.userId || metadata.uploadedBy || ''),
      category: purpose,
      storedName: pieces.at(-1) || 'upload.bin',
    };
  }
  return {
    kind: 'root',
    userId: String(metadata.userId || ''),
    clientId: String(metadata.clientId || ''),
    projectId: String(metadata.projectId || ''),
    category: String(metadata.category || 'uploads'),
    storedName: pieces.at(-1) || 'upload.bin',
  };
}

function projectFolderRole(category) {
  if (['core', 'supporting', 'pages', 'requirement', 'requirements'].includes(category)) return 'Requirements';
  if (['invoice', 'invoices'].includes(category)) return 'Invoices';
  if (['evidence', 'cover', 'deliverables'].includes(category)) return 'Deliverables';
  if (['message', 'messages', 'message-attachments'].includes(category)) return 'Message Attachments';
  return 'Uploads';
}

export class GoogleDriveStorage {
  name = 'google-drive';

  status() {
    const present = (name) => Boolean(String(process.env[name] || '').trim());
    return {
      provider: this.name,
      configured: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'GOOGLE_DATABASE_SPREADSHEET_ID', 'GOOGLE_DRIVE_ROOT_FOLDER_ID', 'GOOGLE_DRIVE_CLIENT_FILES_FOLDER_ID', 'GOOGLE_DRIVE_PROJECT_FILES_FOLDER_ID'].every(present),
    };
  }

  ensureReady() {
    if (!this.status().configured) {
      const error = new Error('Google Drive storage is unavailable');
      error.status = 503;
      error.code = 'STORAGE_UNAVAILABLE';
      throw error;
    }
    return true;
  }

  async folderFor(logicalPath, metadata = {}) {
    this.ensureReady();
    const details = logicalFileDetails(logicalPath, metadata);
    const roots = googleDriveRoots();
    if (details.kind === 'client') {
      return googleDrive.ensureFolderPath({
        parentId: roots.clientFiles,
        metadata: { entityType: 'client', clientId: details.clientId || details.userId },
        segments: [
          { name: `client-${cleanSegment(details.clientId || details.userId)}`, role: 'Client', metadata: { clientId: details.clientId || details.userId } },
          { name: 'Profile', role: 'Profile' },
        ],
      });
    }
    if (details.kind === 'project') {
      return googleDrive.ensureFolderPath({
        parentId: roots.projectFiles,
        metadata: { entityType: 'project', projectId: details.projectId },
        segments: [
          { name: `project-${cleanSegment(details.projectId)}`, role: 'Project', metadata: { projectId: details.projectId } },
          { name: projectFolderRole(details.category), role: projectFolderRole(details.category) },
        ],
      });
    }
    return googleDrive.ensureFolderPath({
      parentId: roots.root,
      metadata: { entityType: 'root' },
      segments: [{ name: 'Uploads', role: 'Uploads' }],
    });
  }

  async recordForPath(logicalPath) {
    return googleFilesRepository.findOne({ logicalPath: String(logicalPath) });
  }

  async uploadBuffer(logicalPath, buffer, contentType = 'application/octet-stream', metadata = {}) {
    const existing = await this.recordForPath(logicalPath);
    const details = logicalFileDetails(logicalPath, metadata);
    const folder = await this.folderFor(logicalPath, metadata);
    const storedName = path.basename(details.storedName);
    const driveFile = existing?.driveFileId
      ? await googleDrive.replaceFile(existing.driveFileId, { buffer, mimeType: contentType, name: storedName })
      : await googleDrive.uploadFile({
        name: storedName,
        parentId: folder.parentId,
        buffer,
        mimeType: contentType,
        appProperties: {
          logicalPath: String(logicalPath),
          projectId: details.projectId,
          clientId: details.clientId,
          userId: details.userId,
          category: details.category,
        },
      });
    const payload = {
      id: existing?.id || crypto.randomUUID(),
      driveFileId: driveFile.id,
      parentDriveFolderId: folder.parentId,
      logicalPath: String(logicalPath),
      userId: details.userId,
      clientId: details.clientId,
      projectId: details.projectId,
      roomId: String(metadata.roomId || ''),
      originalName: String(metadata.originalName || storedName),
      storedName: driveFile.name || storedName,
      mimeType: driveFile.mimeType || contentType,
      size: String(driveFile.size || Buffer.byteLength(buffer)),
      category: details.category,
      uploadedBy: String(metadata.uploadedBy || metadata.userId || ''),
      isPublic: Boolean(metadata.isPublic || details.category === 'cover'),
    };
    const record = existing
      ? await googleFilesRepository.update(existing.id, payload)
      : await googleFilesRepository.create(payload);
    return { path: String(logicalPath), url: await this.createSignedUrl(logicalPath), file: record };
  }

  async createSignedUrl(logicalPath, expiresInSeconds = 60 * 60 * 24 * 7) {
    const record = await this.recordForPath(logicalPath);
    if (!record?.driveFileId) return '';
    const token = signDriveFileAccess(record.driveFileId, expiresInSeconds);
    return `${publicApiBase()}/api/files/drive/${encodeURIComponent(record.driveFileId)}?token=${encodeURIComponent(token)}`;
  }

  async getPublicUrl(logicalPath) {
    return this.createSignedUrl(logicalPath);
  }

  async removePath(logicalPath) {
    if (!logicalPath) return;
    const record = await this.recordForPath(logicalPath);
    if (!record) return;
    await googleDrive.deleteFile(record.driveFileId);
    await googleFilesRepository.delete(record.id);
  }

  async removePaths(paths = []) {
    for (const logicalPath of [...new Set((paths || []).filter(Boolean))]) await this.removePath(logicalPath);
  }

  async downloadStream(driveFileId) {
    this.ensureReady();
    return googleDrive.downloadStream(driveFileId);
  }

  async renameFile(driveFileId, name) {
    this.ensureReady();
    return googleDrive.renameFile(driveFileId, name);
  }

  async listFiles(options) {
    this.ensureReady();
    return googleDrive.listFiles(options);
  }

  async getMetadata(driveFileId) {
    this.ensureReady();
    return googleDrive.getMetadata(driveFileId);
  }
}

export const googleDriveStorage = new GoogleDriveStorage();

