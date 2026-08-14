import File from '../models/File.js';
import { dataProviderName } from '../config/providers.js';
import { GOOGLE_SHEET_TABS, GoogleSheetsRepository } from '../google/sheets.js';
import { createEntityRepository } from './entity.repository.js';

export const filesRepository = createEntityRepository({
  tab: GOOGLE_SHEET_TABS.files,
  model: File,
  aliases: { projectId: 'project', userId: 'uploader' },
});

/** Files are also used by Google Drive when Mongo remains the data provider. */
export const googleFilesRepository = new GoogleSheetsRepository(GOOGLE_SHEET_TABS.files);

export async function findFileByDriveFileId(driveFileId) {
  const provider = dataProviderName() === 'google' ? filesRepository : googleFilesRepository;
  return provider.findOne({ driveFileId: String(driveFileId) });
}

export default filesRepository;

