import { restaurantPlatformProjects } from '../data/restaurantPlatformProjects.js';

export const RESTAURANT_CATALOG_SLUGS = restaurantPlatformProjects.map((p) => p.slug);

// Existing portal ownership, files, billing, evidence and messages are never part of this patch.
const editable = ['title', 'summary', 'shortDescription', 'fullDescription', 'projectClassification',
  'industry', 'websiteType', 'platform', 'technologies', 'liveUrl', 'repositoryUrl',
  'repositoryFullName', 'thumbnail', 'imageAltText', 'categories', 'galleryImages', 'published', 'featured', 'displayOrder',
  'keyFeatures', 'servicesProvided', 'projectOverview', 'resultSummary', 'status', 'seoTitle', 'seoDescription'];

export function restaurantCatalogPlan(existing = []) {
  return restaurantPlatformProjects.map((draft) => {
    const match = existing.find((p) => p.slug === draft.slug || p.repositoryFullName?.toLowerCase() === draft.repositoryFullName);
    if (match && match.repositoryFullName && match.repositoryFullName.toLowerCase() !== draft.repositoryFullName) {
      throw new Error(`Catalog slug conflict: ${draft.slug}`);
    }
    const fields = Object.fromEntries(editable.map((key) => [key, draft[key]]));
    // An existing published release is never silently reverted to a draft by re-running preparation.
    if (match?.published) return { slug: draft.slug, action: 'preserve', id: String(match._id || match.id), patch: {}, before: {} };
    const before = match ? Object.fromEntries(editable.filter((key) => key in match).map((key) => [key, match[key]])) : null;
    // Existing nonempty metadata may have been edited by an owner. Preparation
    // fills gaps only; changed values are proposals for the normal admin editor.
    const patch = {};
    const reviewFields = [];
    for (const [key, incoming] of Object.entries({ ...fields, slug: draft.slug })) {
      const current = match?.[key];
      const empty = current === undefined || current === null || current === '' ||
        (Array.isArray(current) && current.length === 0);
      if (!match || empty) patch[key] = incoming;
      else if (JSON.stringify(current) !== JSON.stringify(incoming)) reviewFields.push(key);
    }
    return { slug: draft.slug, action: match ? 'update-draft' : 'create-draft',
      id: match ? String(match._id || match.id) : null,
      patch, before, reviewFields };
  });
}
