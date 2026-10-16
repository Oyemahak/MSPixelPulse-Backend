import { restaurantPlatformProjects } from '../data/restaurantPlatformProjects.js';

export const SAVORA_SLUG = 'savora-kitchen-table';
export const SAVORA_OPERATIONS_SLUG = 'savora-restaurant-operations';
const STOREFRONT_REPOSITORY = 'mspixelpulseagency/mspixelpulse-demo-restaurant';
const OPERATIONS_REPOSITORY = 'mspixelpulseagency/mspixelpulse-restaurant-orders';
const AURELIA_REPOSITORY = 'mspixelpulseagency/demo-restaurant-bar';

// Exact agency identities only: never classify by a title or hostname substring.
function isProject(project, slug, repository) {
  const actualRepository = String(project.repositoryFullName || '').toLowerCase();
  if (actualRepository) return actualRepository === repository;
  return project.slug === slug;
}

export function isStandaloneSavoraOperations(project) {
  return isProject(project, SAVORA_OPERATIONS_SLUG, OPERATIONS_REPOSITORY);
}

export function canonicalPublicProjectSlug(slug) {
  return slug === SAVORA_OPERATIONS_SLUG ? SAVORA_SLUG : slug;
}

// Public presentation only. Admin records, stable IDs, publication flags, client
// relationships, evidence and the operations application are never written.
export function presentPublicRestaurantProject(project) {
  if (isProject(project, SAVORA_SLUG, STOREFRONT_REPOSITORY)) {
    const source = restaurantPlatformProjects[0];
    const fields = ['title', 'summary', 'shortDescription', 'fullDescription', 'industry',
      'websiteType', 'platform', 'technologies', 'liveUrl', 'thumbnail', 'imageAltText',
      'categories', 'galleryImages', 'keyFeatures', 'projectOverview', 'seoTitle', 'seoDescription'];
    return {
      ...project,
      ...Object.fromEntries(fields.map((field) => [field, source[field]])),
      slug: SAVORA_SLUG,
      operationsUrl: 'https://orders.restaurant.mspixelpulse.com',
      operationsAccess: 'Owner-protected dashboard; isolated public demo available',
    };
  }
  if (isProject(project, 'aurelia-restaurant-bar', AURELIA_REPOSITORY)) {
    return {
      ...project,
      title: 'Aurelia Restaurant & Bar',
      liveUrl: 'https://bar.mspixelpulse.com',
      industry: 'Restaurant / Hospitality',
      shortDescription: 'A hospitality website for restaurant and bar discovery, menus, private events and catering.',
      thumbnail: 'https://mspixelpulse.com/projects/mockups/aurelia-restaurant-bar.webp',
      imageAltText: 'Current Aurelia Restaurant & Bar website shown in desktop and mobile frames',
    };
  }
  return project;
}

export function consolidatePublicRestaurantProjects(projects) {
  const result = [];
  let savoraAdded = false;
  for (const project of projects) {
    if (isStandaloneSavoraOperations(project)) continue;
    if (isProject(project, SAVORA_SLUG, STOREFRONT_REPOSITORY)) {
      if (savoraAdded) continue;
      savoraAdded = true;
    }
    result.push(presentPublicRestaurantProject(project));
  }
  return result;
}
