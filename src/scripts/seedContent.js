import 'dotenv/config';
import path from 'path';
import { pathToFileURL } from 'url';
import SiteContent from '../models/SiteContent.js';
import { dataProviderName } from '../config/providers.js';

const force = process.env.SITE_CONTENT_FORCE === 'true';

async function loadFrontendData() {
  const frontendRoot = process.env.FRONTEND_DIR || path.resolve(process.cwd(), '../MSPixelPulse-Frontend');
  const [{ serviceCatalog }, { pricingPlans }, { proofNotes }] = await Promise.all([
    import(pathToFileURL(path.join(frontendRoot, 'src/data/serviceCatalog.js')).href),
    import(pathToFileURL(path.join(frontendRoot, 'src/data/plans.js')).href),
    import(pathToFileURL(path.join(frontendRoot, 'src/data/proofNotes.js')).href),
  ]);
  return [
    ...serviceCatalog.map((payload, index) => ({ kind: 'service', key: payload.key, title: payload.title, payload, displayOrder: (index + 1) * 10 })),
    ...pricingPlans.map((payload, index) => ({ kind: 'pricing', key: payload.key, title: payload.name, payload, displayOrder: (index + 1) * 10 })),
    ...proofNotes.map((payload, index) => ({ kind: 'proof', key: payload.key, title: payload.business, payload, displayOrder: (index + 1) * 10 })),
  ];
}

async function run() {
  if (dataProviderName() !== 'google') throw new Error('seed:content requires DATA_PROVIDER=google');
  const records = await loadFrontendData();
  const report = { imported: 0, updated: 0, skipped: 0 };
  for (const record of records) {
    const existing = await SiteContent.findOne({ kind: record.kind, key: record.key });
    if (!existing) {
      await SiteContent.create({ ...record, published: true });
      report.imported += 1;
    } else if (force) {
      await SiteContent.updateOne({ _id: existing._id }, { $set: { ...record, published: true, archivedAt: null } }, { runValidators: true });
      report.updated += 1;
    } else {
      report.skipped += 1;
    }
  }
  console.log(JSON.stringify({ ...report, total: records.length }, null, 2));
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
