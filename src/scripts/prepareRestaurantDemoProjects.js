import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { restaurantCatalogPlan } from '../lib/restaurantCatalog.js';

const apply = process.argv.includes('--apply-drafts');
const inspect = apply || process.argv.includes('--inspect');
let Project;
let existing = [];
if (inspect) {
  const { dataProviderName } = await import('../config/providers.js');
  if (dataProviderName() !== 'google') throw new Error('Restaurant catalog integration requires the existing Google data provider.');
  Project = (await import('../models/Project.js')).default;
  // Exact target identities only. No unrelated portal projects are fetched or changed.
  existing = await Project.find({ $or: [
    { slug: 'savora-kitchen-table' }, { slug: 'savora-restaurant-operations' },
    { repositoryFullName: 'mspixelpulseagency/mspixelpulse-demo-restaurant' },
    { repositoryFullName: 'mspixelpulseagency/mspixelpulse-restaurant-orders' },
  ] });
  existing = existing.map((p) => p.toObject ? p.toObject() : p);
}
const plan = restaurantCatalogPlan(existing);
if (apply) {
  const backupArg = process.argv.find((arg) => arg.startsWith('--backup-dir='));
  if (!backupArg) throw new Error('An absolute private --backup-dir is required before draft writes.');
  const backupDir = backupArg.slice('--backup-dir='.length);
  if (!backupDir.startsWith('/') || resolve(backupDir).startsWith(resolve('.') + '/')) throw new Error('Backup directory must be absolute and outside this repository.');
  await mkdir(backupDir, { recursive: true, mode: 0o700 });
  const backup = resolve(backupDir, `restaurant-catalog-before-${Date.now()}.json`);
  await writeFile(backup, JSON.stringify(plan.map(({ slug, id, before }) => ({ slug, id, before })), null, 2), { mode: 0o600 });
  for (const row of plan) {
    if (row.action === 'preserve') continue;
    if (row.id) await Project.updateOne({ _id: row.id, published: { $ne: true } }, { $set: row.patch }, { runValidators: true });
    else await Project.create(row.patch);
  }
}
console.log(JSON.stringify({ applied: apply, entries: plan.map(({ slug, action, id }) => ({ slug, action, id })), publicPublication: false, note: 'Production publication and Aurelia hostname update require live verification and separate targeted approval.' }, null, 2));
