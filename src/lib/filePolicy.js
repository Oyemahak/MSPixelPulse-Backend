import path from 'path';

const PURPOSES = {
  invoice: {
    maxBytes: 15 * 1024 * 1024,
    mimeTypes: new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
    extensions: new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp']),
  },
  evidence: {
    maxBytes: 15 * 1024 * 1024,
    mimeTypes: new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
    extensions: new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp']),
  },
  cover: {
    maxBytes: 8 * 1024 * 1024,
    mimeTypes: new Set(['image/jpeg', 'image/png', 'image/webp']),
    extensions: new Set(['.jpg', '.jpeg', '.png', '.webp']),
  },
  avatar: {
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: new Set(['image/jpeg', 'image/png', 'image/webp']),
    extensions: new Set(['.jpg', '.jpeg', '.png', '.webp']),
  },
  requirement: {
    maxBytes: 15 * 1024 * 1024,
    mimeTypes: new Set([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/webp',
    ]),
    extensions: new Set(['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.webp']),
  },
};

export function cleanFileName(value = 'file') {
  const base = path.basename(String(value || 'file')).replace(/[^a-zA-Z0-9._-]+/g, '_');
  return base.slice(0, 140) || 'file';
}

export function validateUpload(file, purpose) {
  const policy = PURPOSES[purpose];
  if (!policy) return { ok: false, message: 'Invalid upload purpose' };
  if (!file) return { ok: false, message: 'File is required' };
  if (!policy.mimeTypes.has(String(file.mimetype || '').toLowerCase())) {
    return { ok: false, message: `Unsupported ${purpose} file type` };
  }
  if (!policy.extensions.has(path.extname(String(file.originalname || '')).toLowerCase())) {
    return { ok: false, message: `Unsupported ${purpose} filename extension` };
  }
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > policy.maxBytes) {
    return { ok: false, message: `${purpose} file exceeds the size limit` };
  }
  return { ok: true };
}

export function projectFilePrefix(projectId, purpose) {
  return `projects/${String(projectId)}/${purpose}s/`;
}

export function pathBelongsToProjectPurpose(storagePath, projectId, purpose) {
  return String(storagePath || '').startsWith(projectFilePrefix(projectId, purpose));
}
