import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalPublicProjectSlug,
  consolidatePublicRestaurantProjects,
  presentPublicRestaurantProject,
} from './publicRestaurantProjects.js';

test('public listing combines SAVORA without mutating either stored record or unrelated projects', () => {
  const unrelated = { _id: 'client', slug: 'other', title: 'Restaurant client', liveUrl: 'https://example.com' };
  const rows = [unrelated,
    { _id: 'savora', slug: 'savora-kitchen-table', title: 'Old name', published: true, featured: true, displayOrder: 12, resultSummary: 'Owner note' },
    { _id: 'ops', slug: 'savora-restaurant-operations', published: true },
    { _id: 'duplicate', slug: 'old-import', repositoryFullName: 'MSPixelPulseAgency/mspixelpulse-demo-restaurant' }];
  const original = JSON.stringify(rows);
  const result = consolidatePublicRestaurantProjects(rows);
  assert.equal(result.length, 2);
  assert.equal(result[0], unrelated);
  assert.equal(result[1]._id, 'savora');
  assert.equal(result[1].title, 'SAVORA — Restaurant Platform');
  assert.equal(result[1].liveUrl, 'https://restaurant.mspixelpulse.com');
  assert.equal(result[1].operationsUrl, 'https://orders.restaurant.mspixelpulse.com');
  assert.equal(result[1].published, true);
  assert.equal(result[1].featured, true);
  assert.equal(result[1].displayOrder, 12);
  assert.equal(result[1].resultSummary, 'Owner note');
  assert.equal(result[1].galleryImages.length, 4);
  assert.equal(JSON.stringify(rows), original);
});

test('canonical public detail alias does not rename unrelated routes or create unpublished projects', () => {
  assert.equal(canonicalPublicProjectSlug('savora-restaurant-operations'), 'savora-kitchen-table');
  assert.equal(canonicalPublicProjectSlug('unrelated'), 'unrelated');
  assert.deepEqual(consolidatePublicRestaurantProjects([]), []);
  assert.deepEqual(consolidatePublicRestaurantProjects([{ slug: 'savora-restaurant-operations' }]), []);
});

test('Aurelia uses its own production hostname and current screenshot', () => {
  const source = { slug: 'aurelia-restaurant-bar', liveUrl: 'https://restaurant.mspixelpulse.com', technologies: ['Next.js'], displayOrder: 42 };
  const result = presentPublicRestaurantProject(source);
  assert.equal(result.liveUrl, 'https://bar.mspixelpulse.com');
  assert.equal(result.title, 'Aurelia Restaurant & Bar');
  assert.ok(result.thumbnail.endsWith('/aurelia-restaurant-bar.webp'));
  assert.equal(result.technologies, source.technologies);
  assert.equal(result.displayOrder, 42);
  assert.equal(source.liveUrl, 'https://restaurant.mspixelpulse.com');
});

test('a conflicting real-client repository is never rebranded or hidden by a matching slug', () => {
  const source = { slug: 'savora-kitchen-table', repositoryFullName: 'client/restaurant', title: 'Real client' };
  assert.equal(presentPublicRestaurantProject(source), source);
  const operationsConflict = { slug: 'savora-restaurant-operations', repositoryFullName: 'client/dashboard' };
  assert.deepEqual(consolidatePublicRestaurantProjects([operationsConflict]), [operationsConflict]);
});
