import test from 'node:test';
import assert from 'node:assert/strict';
import { aurelImmigrationProject as incoming } from '../data/aurelImmigrationProject.js';
import { BRAND_FIELDS, brandUpdateFor } from './projectBrandUpdate.js';

const stored = {
  _id: '13ad72b6-097a-4c8d-af70-87a0595e50a0',
  slug: 'aurel-immigration-legal',
  repositoryFullName: 'mspixelpulseagency/mspixelpulse-demo-immigration',
  title: 'AUREL Immigration & Legal',
  shortDescription: 'An editorial immigration website concept featuring student resources, Canadian pathways, instant search and a consultation preview.',
  keyFeatures: ['26 prerendered pages'],
  liveUrl: 'https://immigration.mspixelpulse.com',
  published: true,
  client: 'client-id',
  evidence: [{ title: 'kept' }],
};

test('Northstead brand data keeps the canonical identity and the required card summary', () => {
  assert.equal(incoming.slug, 'aurel-immigration-legal');
  assert.equal(incoming.repositoryFullName, 'mspixelpulseagency/mspixelpulse-demo-immigration');
  assert.equal(incoming.liveUrl, 'https://immigration.mspixelpulse.com');
  assert.equal(incoming.title, 'Northstead Immigration');
  assert.equal(
    incoming.shortDescription,
    'A premium Canadian immigration website featuring student resources, immigration pathways, smart search, and consultation experiences.',
  );
  assert.match(incoming.projectOverview, /no licensed immigration or legal representation/);
  assert.ok(incoming.keyFeatures.includes('27 prerendered pages'));
  assert.ok(incoming.keyFeatures.includes('Reviews & feedback page'));
  assert.ok(incoming.keyFeatures.includes('Autoplay Toronto hero film'));
  for (const field of BRAND_FIELDS) assert.doesNotMatch(JSON.stringify(incoming[field]), /AUREL/, field);
});

test('brand update changes only differing brand fields on the matching record', () => {
  const changes = brandUpdateFor(stored, incoming);
  assert.equal(changes.title, 'Northstead Immigration');
  assert.deepEqual(changes.keyFeatures, incoming.keyFeatures);
  for (const field of Object.keys(changes)) assert.ok(BRAND_FIELDS.includes(field), field);
  assert.equal('liveUrl' in changes || 'published' in changes || 'client' in changes || 'evidence' in changes || 'slug' in changes, false);
});

test('brand update is idempotent once applied', () => {
  const applied = { ...stored, ...brandUpdateFor(stored, incoming) };
  assert.deepEqual(brandUpdateFor(applied, incoming), {});
});

test('brand update refuses identity mismatches and missing records', () => {
  assert.throws(() => brandUpdateFor(null, incoming), /never creates/);
  assert.throws(() => brandUpdateFor({ ...stored, repositoryFullName: 'other/repo' }, incoming), /identity mismatch/);
  assert.throws(() => brandUpdateFor({ ...stored, slug: 'northstead-immigration' }, incoming), /identity mismatch/);
});

test('thumbnail is only changed when an https URL is provided', () => {
  assert.equal('thumbnail' in brandUpdateFor(stored, incoming), false);
  assert.equal(
    brandUpdateFor(stored, incoming, { thumbnail: 'https://mspixelpulse.com/projects/mockups/aurel-immigration-legal.webp' }).thumbnail,
    'https://mspixelpulse.com/projects/mockups/aurel-immigration-legal.webp',
  );
  assert.throws(() => brandUpdateFor(stored, incoming, { thumbnail: 'http://example.com/a.webp' }), /https/);
});
