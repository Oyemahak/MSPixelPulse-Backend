import jwt from 'jsonwebtoken';
import { jwtSecret } from '../utils/jwt.js';

export function signDriveFileAccess(fileId, expiresInSeconds = 60 * 60 * 24 * 7) {
  return jwt.sign({ scope: 'drive-file', fileId: String(fileId) }, jwtSecret(), { expiresIn: expiresInSeconds });
}

export function verifyDriveFileAccess(token, fileId) {
  try {
    const payload = jwt.verify(String(token || ''), jwtSecret());
    return payload?.scope === 'drive-file' && String(payload.fileId) === String(fileId);
  } catch {
    return false;
  }
}

export function signDriveUploadCompletion(payload, expiresInSeconds = 30 * 60) {
  return jwt.sign({ scope: 'drive-upload', ...payload }, jwtSecret(), { expiresIn: expiresInSeconds });
}

export function verifyDriveUploadCompletion(token) {
  try {
    const payload = jwt.verify(String(token || ''), jwtSecret());
    return payload?.scope === 'drive-upload' ? payload : null;
  } catch {
    return null;
  }
}
