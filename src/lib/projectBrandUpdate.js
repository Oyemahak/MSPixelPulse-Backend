// Brand/text fields that `registerAurelImmigrationProject.js --update-brand` may change on the
// existing record. Every other field (identity, URLs, publication, assignments, evidence,
// billing, files, display order) is left exactly as stored.
export const BRAND_FIELDS = Object.freeze([
  'title',
  'summary',
  'shortDescription',
  'imageAltText',
  'projectOverview',
  'resultSummary',
  'seoTitle',
  'seoDescription',
  'keyFeatures',
]);

function same(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

// Returns only the brand fields whose stored value differs from `incoming`. Throws (so no write
// happens) unless the existing record matches both the canonical slug and repository.
export function brandUpdateFor(existing, incoming, { thumbnail = '' } = {}) {
  if (!existing) throw new Error('No existing project found; --update-brand never creates a record.');
  if (existing.slug !== incoming.slug || existing.repositoryFullName !== incoming.repositoryFullName) {
    throw new Error('Project identity mismatch (slug and repositoryFullName must both match); no write performed.');
  }
  const target = Object.fromEntries(BRAND_FIELDS.map((field) => [field, incoming[field]]));
  if (thumbnail) {
    const url = new URL(thumbnail);
    if (url.protocol !== 'https:') throw new Error('--thumbnail must be an https URL.');
    target.thumbnail = url.href;
  }
  return Object.fromEntries(Object.entries(target).filter(([field, value]) => !same(existing[field], value)));
}
