import test from 'node:test';
import assert from 'node:assert/strict';
import { restaurantCatalogPlan } from './restaurantCatalog.js';

test('targeted restaurant draft planning preserves unrelated production and portal data', () => {
  const existing = [{ _id: 'client-project', slug: 'unrelated', published: true, client: 'private-client' },
    { _id: 'savora-id', slug: 'savora-kitchen-table', repositoryFullName: 'mspixelpulseagency/mspixelpulse-demo-restaurant', client: 'private-client', files: ['private-file'], published: false }];
  const original = JSON.stringify(existing);
  const plan = restaurantCatalogPlan(existing);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].id, 'savora-id');
  assert.equal(plan[0].before.published, false);
  assert.equal('published' in plan[0].patch, false);
  assert.equal(plan[0].patch.status, 'draft');
  assert.equal('client' in plan[0].patch, false);
  assert.equal('files' in plan[0].patch, false);
  assert.equal(JSON.stringify(existing), original);
  assert.equal(plan.some((p) => p.id === 'client-project'), false);
});

test('draft preparation preserves owner-edited metadata and never prepares another operations record', () => {
  const existing = [{ _id: 'draft', slug: 'savora-kitchen-table', title: 'Owner title',
    thumbnail: 'https://example.com/custom.webp', featured: true, published: false },
    { _id: 'operations', slug: 'savora-restaurant-operations', published: true }];
  const original = JSON.stringify(existing);
  const [plan] = restaurantCatalogPlan(existing);
  assert.equal('title' in plan.patch, false);
  assert.equal('thumbnail' in plan.patch, false);
  assert.equal('featured' in plan.patch, false);
  assert.ok(plan.reviewFields.includes('title'));
  assert.ok(plan.reviewFields.includes('thumbnail'));
  assert.equal(plan.id, 'draft');
  assert.equal(JSON.stringify(existing), original);
});

test('a verified published restaurant is preserved when preparation is repeated', () => {
  const plan = restaurantCatalogPlan([{ _id: 'released', slug: 'savora-kitchen-table', published: true }]);
  assert.equal(plan[0].action, 'preserve');
  assert.deepEqual(plan[0].patch, {});
});

test('unrelated repository occupying a restaurant slug fails closed', () => {
  assert.throws(() => restaurantCatalogPlan([{ slug: 'savora-kitchen-table', repositoryFullName: 'other/real-client' }]), /conflict/);
});
