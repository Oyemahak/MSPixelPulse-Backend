import { google } from 'googleapis';
import { pathToFileURL } from 'node:url';

export const GMAIL_ACCOUNT = 'mspixelpulse@gmail.com';
export const GMAIL_LABELS = Object.freeze([
  ['requirements', 'MSPixelPulse/Requirements', 'REQUIREMENT'],
  ['projects', 'MSPixelPulse/Projects', 'PROJECT'],
  ['messages', 'MSPixelPulse/Messages', 'MESSAGE'],
  ['announcements', 'MSPixelPulse/Announcements', 'ANNOUNCEMENT'],
  ['evidence', 'MSPixelPulse/Evidence', 'EVIDENCE'],
  ['billing', 'MSPixelPulse/Billing', 'BILLING'],
  ['leads', 'MSPixelPulse/Leads', 'LEAD'],
  ['approvals', 'MSPixelPulse/Approvals', 'APPROVAL'],
  ['support', 'MSPixelPulse/Support', 'SUPPORT'],
  ['system', 'MSPixelPulse/System', 'SYSTEM'],
]);

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function managedFilterQuery(tag) {
  return `to:(${GMAIL_ACCOUNT}) subject:"[MSP:${tag}]"`;
}

export function desiredFilters(labelIds) {
  return GMAIL_LABELS.map(([, labelName, tag]) => ({
    labelName,
    criteria: { query: managedFilterQuery(tag) },
    action: { addLabelIds: [labelIds.get(labelName)], removeLabelIds: ['INBOX'] },
  }));
}

function sameIds(left = [], right = []) {
  return [...left].sort().join('|') === [...right].sort().join('|');
}

export function filterMatches(existing, desired) {
  return existing?.criteria?.query === desired.criteria.query
    && sameIds(existing?.action?.addLabelIds, desired.action.addLabelIds)
    && sameIds(existing?.action?.removeLabelIds, desired.action.removeLabelIds);
}

async function ensureLabel(gmail, name, labelsByName) {
  if (labelsByName.has(name)) return { id: labelsByName.get(name).id, created: false };
  const response = await gmail.users.labels.create({
    userId: 'me',
    requestBody: { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' },
  });
  labelsByName.set(name, response.data);
  return { id: response.data.id, created: true };
}

async function main() {
  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify({ account: GMAIL_ACCOUNT, labels: ['MSPixelPulse', ...GMAIL_LABELS.map(([, name]) => name)], filters: GMAIL_LABELS.map(([, name, tag]) => ({ label: name, query: managedFilterQuery(tag), skipInbox: true })) }, null, 2));
    return;
  }

  const oauth = new google.auth.OAuth2(
    required('GMAIL_CLIENT_ID'),
    required('GMAIL_CLIENT_SECRET'),
    process.env.GMAIL_REDIRECT_URI || 'http://localhost',
  );
  oauth.setCredentials({ refresh_token: required('GMAIL_REFRESH_TOKEN') });
  const gmail = google.gmail({ version: 'v1', auth: oauth });
  const profile = await gmail.users.getProfile({ userId: 'me' });
  const emailAddress = String(profile.data.emailAddress || '').trim().toLowerCase();
  if (emailAddress !== GMAIL_ACCOUNT) throw new Error(`Gmail credentials belong to ${emailAddress || 'an unknown account'}, not ${GMAIL_ACCOUNT}`);

  const labelResponse = await gmail.users.labels.list({ userId: 'me' });
  const labelsByName = new Map((labelResponse.data.labels || []).map((label) => [label.name, label]));
  let labelsCreated = 0;
  labelsCreated += (await ensureLabel(gmail, 'MSPixelPulse', labelsByName)).created ? 1 : 0;
  const labelIds = new Map();
  for (const [, name] of GMAIL_LABELS) {
    const result = await ensureLabel(gmail, name, labelsByName);
    labelIds.set(name, result.id);
    if (result.created) labelsCreated += 1;
  }

  const filterResponse = await gmail.users.settings.filters.list({ userId: 'me' });
  const existingFilters = filterResponse.data.filter || [];
  let filtersCreated = 0;
  let filtersUpdated = 0;
  for (const desired of desiredFilters(labelIds)) {
    const managed = existingFilters.filter((filter) => filter.criteria?.query === desired.criteria.query);
    if (managed.some((filter) => filterMatches(filter, desired))) continue;
    for (const filter of managed) {
      await gmail.users.settings.filters.delete({ userId: 'me', id: filter.id });
      filtersUpdated += 1;
    }
    await gmail.users.settings.filters.create({ userId: 'me', requestBody: { criteria: desired.criteria, action: desired.action } });
    filtersCreated += 1;
  }

  console.log(`Gmail notification organization ready for ${GMAIL_ACCOUNT}`);
  console.log(`Labels created: ${labelsCreated}; filters created: ${filtersCreated}; managed filters replaced: ${filtersUpdated}`);
  console.log('Matching MSPixelPulse operational messages will skip Inbox and remain searchable under their category label.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Gmail notification setup failed: ${error?.message || 'Unknown error'}`);
    process.exitCode = 1;
  });
}
