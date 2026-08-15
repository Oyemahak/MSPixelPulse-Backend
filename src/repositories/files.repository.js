// src/repositories/files.repository.js

import {
  GOOGLE_SHEET_TABS,
  GoogleSheetsRepository,
} from '../google/sheets.js';

import {
  createEntityRepository,
} from './entity.repository.js';

/**
 * Application-facing Files repository.
 *
 * Google Sheets is the only production database provider.
 * Stable application IDs are used instead of spreadsheet row numbers.
 */
export const filesRepository =
  createEntityRepository({
    tab: GOOGLE_SHEET_TABS.files,
  });

/**
 * Google Drive storage needs direct access to the Files sheet for
 * logical-path -> Drive-file metadata resolution.
 *
 * Keep this export because GoogleDriveStorage already consumes it.
 */
export const googleFilesRepository =
  new GoogleSheetsRepository(
    GOOGLE_SHEET_TABS.files,
  );

/**
 * Resolve a stored file using its Google Drive file ID.
 */
export async function findFileByDriveFileId(
  driveFileId,
) {
  const id = String(
    driveFileId || '',
  ).trim();

  if (!id) {
    return null;
  }

  return googleFilesRepository.findOne({
    driveFileId: id,
  });
}

export default filesRepository;