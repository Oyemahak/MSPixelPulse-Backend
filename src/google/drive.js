import path from 'path';
import { getGoogleApis } from './auth.js';
import { guardPhase1DriveRootId } from './phase1SmokeSafety.js';
import { withGoogleRetry } from './retry.js';

function envId(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    const error = new Error(`${name} is required when STORAGE_PROVIDER=google-drive`);
    error.code = 'GOOGLE_ENV_MISSING';
    error.status = 503;
    error.envName = name;
    throw error;
  }
  return guardPhase1DriveRootId(name, value);
}

export function googleDriveRoots() {
  return {
    root: envId('GOOGLE_DRIVE_ROOT_FOLDER_ID'),
    clientFiles: envId('GOOGLE_DRIVE_CLIENT_FILES_FOLDER_ID'),
    projectFiles: envId('GOOGLE_DRIVE_PROJECT_FILES_FOLDER_ID'),
  };
}

function queryString(value) {
  return String(value).replace(/'/g, "\\'");
}

function appPropertyQuery(properties = {}) {
  return Object.entries(properties)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `appProperties has { key='${queryString(key)}' and value='${queryString(value)}' }`);
}

function folderQuery({ name, parentId, appProperties = {} }) {
  return [
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false',
    parentId ? `'${queryString(parentId)}' in parents` : '',
    name ? `name = '${queryString(name)}'` : '',
    ...appPropertyQuery(appProperties),
  ].filter(Boolean).join(' and ');
}

export class GoogleDriveService {
  async drive() {
    return (await getGoogleApis()).drive;
  }

  async findFolder({ name, parentId, appProperties = {} }) {
    const drive = await this.drive();
    const response = await withGoogleRetry(() => drive.files.list({
      q: folderQuery({ name, parentId, appProperties }),
      fields: 'files(id,name,parents,appProperties,createdTime,modifiedTime)',
      pageSize: 10,
      spaces: 'drive',
    }));
    return response.data.files?.[0] || null;
  }

  async createFolder({ name, parentId, appProperties = {} }) {
    const drive = await this.drive();
    const response = await withGoogleRetry(() => drive.files.create({
      requestBody: {
        name: String(name),
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : undefined,
        appProperties: { mspixelpulseManaged: 'true', ...appProperties },
      },
      fields: 'id,name,parents,appProperties,createdTime,modifiedTime',
    }));
    return response.data;
  }

  async findOrCreateFolder(input) {
    return (await this.findFolder(input)) || this.createFolder(input);
  }

  async ensureFolderPath({ parentId, segments = [], metadata = {} }) {
    let currentParentId = parentId;
    const folders = [];
    for (const segment of segments) {
      const folder = await this.findOrCreateFolder({
        name: segment.name,
        parentId: currentParentId,
        appProperties: { folderRole: segment.role || segment.name, ...metadata, ...(segment.metadata || {}) },
      });
      folders.push(folder);
      currentParentId = folder.id;
    }
    return { parentId: currentParentId, folders };
  }

  async uploadFile({ name, parentId, buffer, mimeType = 'application/octet-stream', appProperties = {} }) {
    const drive = await this.drive();
    const response = await withGoogleRetry(() => drive.files.create({
      requestBody: {
        name: path.basename(String(name || 'upload.bin')),
        parents: [parentId],
        mimeType,
        appProperties: { mspixelpulseManaged: 'true', ...appProperties },
      },
      media: { mimeType, body: buffer },
      fields: 'id,name,mimeType,size,parents,appProperties,createdTime,modifiedTime,md5Checksum',
    }));
    return response.data;
  }

  async getMetadata(fileId) {
    const drive = await this.drive();
    const response = await withGoogleRetry(() => drive.files.get({
      fileId,
      fields: 'id,name,mimeType,size,parents,appProperties,createdTime,modifiedTime,md5Checksum,trashed',
    }));
    return response.data;
  }

  async downloadStream(fileId) {
    const drive = await this.drive();
    const response = await withGoogleRetry(() => drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' }));
    return response.data;
  }

  async renameFile(fileId, name) {
    const drive = await this.drive();
    const response = await withGoogleRetry(() => drive.files.update({
      fileId,
      requestBody: { name: path.basename(String(name || 'file')) },
      fields: 'id,name,mimeType,size,parents,appProperties,createdTime,modifiedTime,md5Checksum',
    }));
    return response.data;
  }

  async replaceFile(fileId, { buffer, mimeType = 'application/octet-stream', name } = {}) {
    const drive = await this.drive();
    const response = await withGoogleRetry(() => drive.files.update({
      fileId,
      requestBody: name ? { name: path.basename(String(name)) } : undefined,
      media: { mimeType, body: buffer },
      fields: 'id,name,mimeType,size,parents,appProperties,createdTime,modifiedTime,md5Checksum',
    }));
    return response.data;
  }

  async deleteFile(fileId) {
    const drive = await this.drive();
    await withGoogleRetry(() => drive.files.delete({ fileId }));
    return true;
  }

  async listFiles({ parentId, appProperties = {}, pageToken, pageSize = 100 } = {}) {
    const drive = await this.drive();
    const query = [
      'trashed = false',
      parentId ? `'${queryString(parentId)}' in parents` : '',
      ...appPropertyQuery(appProperties),
    ].filter(Boolean).join(' and ');
    const response = await withGoogleRetry(() => drive.files.list({
      q: query,
      fields: 'nextPageToken,files(id,name,mimeType,size,parents,appProperties,createdTime,modifiedTime,md5Checksum)',
      pageSize: Math.min(1000, Math.max(1, Number(pageSize) || 100)),
      pageToken,
      spaces: 'drive',
    }));
    return { files: response.data.files || [], nextPageToken: response.data.nextPageToken || null };
  }
}

export const googleDrive = new GoogleDriveService();
