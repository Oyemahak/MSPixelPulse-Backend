import 'dotenv/config';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

function requiredTestEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`${name} is required. Use a separate Phase 1 test resource, never migrated or production data.`);
  }
  return value;
}

async function streamText(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function roundTrip(repository, record, created) {
  const value = await repository.create(record);
  created.push({ repository, id: value.id });
  assert.equal(String((await repository.findById(value.id)).id), String(value.id));
  const updated = await repository.update(value.id, { phase1SmokeUpdated: true });
  assert.equal(String(updated.phase1SmokeUpdated), 'true');
  const listed = await repository.list({ filter: { id: value.id }, limit: 10 });
  assert.equal(listed.total, 1);
  return value;
}

const testSpreadsheet = requiredTestEnv('GOOGLE_PHASE1_TEST_SPREADSHEET_ID');
const testDriveRoot = requiredTestEnv('GOOGLE_PHASE1_TEST_DRIVE_ROOT_FOLDER_ID');

// These assignments intentionally happen before any repository or storage
// module is loaded. Static ESM imports are hoisted and would make this unsafe.
process.env.GOOGLE_DATABASE_SPREADSHEET_ID = testSpreadsheet;
process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID = testDriveRoot;
process.env.GOOGLE_DRIVE_CLIENT_FILES_FOLDER_ID = testDriveRoot;
process.env.GOOGLE_DRIVE_PROJECT_FILES_FOLDER_ID = testDriveRoot;
process.env.DATA_PROVIDER = 'google';
process.env.STORAGE_PROVIDER = 'google-drive';
process.env.GOOGLE_PHASE1_SMOKE_TEST = 'true';

const { assertPhase1GoogleTargets } = await import('../google/phase1SmokeSafety.js');
const targets = assertPhase1GoogleTargets();
assert.equal(process.env.GOOGLE_DATABASE_SPREADSHEET_ID, testSpreadsheet);
assert.equal(process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID, testDriveRoot);

const [repositories, sheetsModule, driveModule, storageModule] = await Promise.all([
  import('../repositories/index.js'),
  import('../google/sheets.js'),
  import('../google/drive.js'),
  import('../storage/provider.js'),
]);

const {
  blogCommentsRepository,
  blogReactionsRepository,
  blogSharesRepository,
  blogSubscribersRepository,
  filesRepository,
  invoicesRepository,
  leadsRepository,
  messagesRepository,
  notificationsRepository,
  projectMembersRepository,
  projectsRepository,
  requirementsRepository,
  roomsRepository,
  siteContentRepository,
  tasksRepository,
  usersRepository,
} = repositories;
const { ensureGoogleSheetTabs, GOOGLE_SHEET_TABS } = sheetsModule;
const { googleDrive } = driveModule;
const { getStorageProvider } = storageModule;

assert.equal(getStorageProvider().name, 'google-drive');
console.log(JSON.stringify({
  event: 'google-provider-smoke-targets',
  sheetsApiUrl: `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(targets.spreadsheetId)}`,
  spreadsheetId: targets.spreadsheetId,
  driveApiUrl: 'https://www.googleapis.com/drive/v3/files',
  driveRootFolderId: targets.driveRootFolderId,
}));

const initializedTabs = await ensureGoogleSheetTabs({
  tabs: Object.values(GOOGLE_SHEET_TABS),
  createMissing: true,
  spreadsheet: testSpreadsheet,
});
assert.equal(initializedTabs.spreadsheetId, testSpreadsheet);
console.log(JSON.stringify({
  event: 'google-provider-smoke-tabs',
  spreadsheetId: initializedTabs.spreadsheetId,
  createdTabs: initializedTabs.createdTabs,
  requiredTabCount: Object.keys(GOOGLE_SHEET_TABS).length,
}));

const runId = `phase1-smoke-${Date.now()}`;
const ids = {
  user: `${runId}-user`,
  project: `${runId}-project`,
  room: `${runId}-room`,
};
const created = [];
let testFolder;
let driveFile;

try {
  assert.deepEqual(assertPhase1GoogleTargets(), targets);
  const passwordHash = await bcrypt.hash('phase1-test-password', 10);
  await roundTrip(usersRepository, {
    id: ids.user,
    name: 'Phase 1 Test User',
    email: `${runId}@example.test`,
    passwordHash,
    role: 'client',
    status: 'active',
    applicationStatus: 'approved',
  }, created);
  assert.equal(Boolean(await usersRepository.verifyCredentials(`${runId}@example.test`, 'phase1-test-password')), true);

  await roundTrip(projectsRepository, { id: ids.project, title: 'Phase 1 Test Project', clientId: ids.user, status: 'active' }, created);
  const member = await projectMembersRepository.upsert({ projectId: ids.project, userId: ids.user, role: 'client' });
  created.push({ repository: projectMembersRepository, id: member.id });
  assert.equal((await projectMembersRepository.findByUser(ids.user)).total, 1);

  await roundTrip(requirementsRepository, { id: `${runId}-requirement`, projectId: ids.project, clientId: ids.user, pages: [{ name: 'Home', note: 'Test' }] }, created);
  await roundTrip(roomsRepository, { id: ids.room, projectId: ids.project }, created);
  await roundTrip(messagesRepository, { id: `${runId}-message`, projectId: ids.project, roomId: ids.room, userId: ids.user, kind: 'room', text: 'Phase 1 test' }, created);
  await roundTrip(invoicesRepository, { id: `${runId}-invoice`, projectId: ids.project, clientId: ids.user, status: 'draft', currency: 'CAD' }, created);
  await roundTrip(filesRepository, { id: `${runId}-file`, projectId: ids.project, userId: ids.user, driveFileId: `${runId}-placeholder`, logicalPath: `projects/${ids.project}/uploads/metadata.txt`, originalName: 'metadata.txt', storedName: 'metadata.txt', mimeType: 'text/plain', size: '1', category: 'uploads' }, created);
  await roundTrip(leadsRepository, { id: `${runId}-lead`, name: 'Phase 1 Lead', email: `${runId}-lead@example.test`, message: 'Test', status: 'new' }, created);
  await roundTrip(tasksRepository, { id: `${runId}-task`, projectId: ids.project, userId: ids.user, title: 'Phase 1 test task', status: 'todo' }, created);
  await roundTrip(notificationsRepository, { id: `${runId}-notification`, notificationType: 'phase1_test', relatedEntityType: 'Project', relatedEntityId: ids.project, status: 'skipped' }, created);
  await roundTrip(blogCommentsRepository, { id: `${runId}-comment`, blogSlug: 'phase-1-test', blogTitle: 'Phase 1 Test', blogUrl: 'https://example.test', name: 'Test', email: `${runId}-comment@example.test`, comment: 'Test comment', status: 'pending' }, created);
  await roundTrip(blogReactionsRepository, { id: `${runId}-reaction`, blogSlug: 'phase-1-test', blogTitle: 'Phase 1 Test', blogUrl: 'https://example.test', reactionType: 'like', identityHash: `${runId}-hash` }, created);
  await roundTrip(blogSharesRepository, { id: `${runId}-share`, blogSlug: 'phase-1-test', blogTitle: 'Phase 1 Test', blogUrl: 'https://example.test', platform: 'copy_link', eventType: 'share_option_selected', identityHash: `${runId}-share-hash` }, created);
  await roundTrip(blogSubscribersRepository, { id: `${runId}-subscriber`, email: `${runId}-subscriber@example.test`, status: 'pending', sourceBlogSlug: 'phase-1-test', sourceBlogTitle: 'Phase 1 Test', sourceBlogUrl: 'https://example.test', unsubscribeTokenHash: `${runId}-unsubscribe` }, created);
  await roundTrip(siteContentRepository, { id: `${runId}-content`, kind: 'service', key: `${runId}-service`, title: 'Phase 1 Test', payload: { test: true }, published: false }, created);

  testFolder = await googleDrive.createFolder({ name: runId, parentId: testDriveRoot, appProperties: { phase1Test: runId } });
  assert.equal((testFolder.parents || []).includes(testDriveRoot), true);
  driveFile = await googleDrive.uploadFile({ name: 'phase1.txt', parentId: testFolder.id, buffer: Buffer.from('before'), mimeType: 'text/plain', appProperties: { phase1Test: runId } });
  assert.equal((await googleDrive.listFiles({ parentId: testFolder.id })).files.some((file) => file.id === driveFile.id), true);
  await googleDrive.renameFile(driveFile.id, 'phase1-renamed.txt');
  await googleDrive.replaceFile(driveFile.id, { buffer: Buffer.from('after'), mimeType: 'text/plain' });
  assert.equal(await streamText(await googleDrive.downloadStream(driveFile.id)), 'after');
  await googleDrive.deleteFile(driveFile.id);
  driveFile = null;

  console.log(JSON.stringify({
    ok: true,
    runId,
    spreadsheetId: targets.spreadsheetId,
    driveRootFolderId: targets.driveRootFolderId,
    checks: [
      `sheets CRUD (${Object.keys(GOOGLE_SHEET_TABS).length} repositories)`,
      'bcrypt lookup',
      'relationships',
      'drive upload/download/replace/delete',
    ],
  }));
} finally {
  if (driveFile?.id) await googleDrive.deleteFile(driveFile.id).catch(() => {});
  if (testFolder?.id) await googleDrive.deleteFile(testFolder.id).catch(() => {});
  for (const entry of created.reverse()) await entry.repository.delete(entry.id).catch(() => {});
}
