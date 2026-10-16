import test from 'node:test';
import assert from 'node:assert/strict';
import { GoogleSheetsRepository } from '../../../google/sheets.js';
import { getPublicProject, listPublicProjects } from './project.controller.js';

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('public project list keeps published-only projection and consolidates without database writes', async (t) => {
  const rows = [
    { id: 'main', slug: 'savora-kitchen-table', published: true, client: 'private-client', evidence: ['private'], announcements: ['private'] },
    { id: 'ops', slug: 'savora-restaurant-operations', published: true },
    { id: 'other', slug: 'unrelated', title: 'Unrelated', published: true },
    { id: 'draft', slug: 'unpublished', published: false },
  ];
  t.mock.method(GoogleSheetsRepository.prototype, 'list', async () => ({ items: rows, hasMore: false }));
  t.mock.method(GoogleSheetsRepository.prototype, 'update', () => assert.fail('public reads must not write'));
  t.mock.method(GoogleSheetsRepository.prototype, 'delete', () => assert.fail('public reads must not delete'));
  const res = response();
  await listPublicProjects({ query: {} }, res);
  assert.equal(res.body.projects.length, 2);
  assert.equal(res.body.projects[0]._id, 'main');
  assert.equal(res.body.projects[0].operationsUrl, 'https://orders.restaurant.mspixelpulse.com');
  for (const privateField of ['client', 'developer', 'evidence', 'announcements']) {
    assert.equal(privateField in res.body.projects[0], false);
  }
  assert.equal(rows[0].title, undefined);
});

test('legacy operations detail reads only the published canonical SAVORA project', async (t) => {
  t.mock.method(GoogleSheetsRepository.prototype, 'list', async () => ({
    items: [{ id: 'main', slug: 'savora-kitchen-table', published: true },
      { id: 'ops', slug: 'savora-restaurant-operations', published: true }], hasMore: false,
  }));
  const res = response();
  await getPublicProject({ params: { slug: 'savora-restaurant-operations' } }, res);
  assert.equal(res.body.project.slug, 'savora-kitchen-table');
  assert.equal(res.body.project.title, 'SAVORA — Restaurant Platform');
});

test('an unpublished or missing canonical SAVORA remains a 404 through the alias', async (t) => {
  t.mock.method(GoogleSheetsRepository.prototype, 'list', async () => ({
    items: [{ id: 'draft', slug: 'savora-kitchen-table', published: false },
      { id: 'ops', slug: 'savora-restaurant-operations', published: true }], hasMore: false,
  }));
  const res = response();
  await getPublicProject({ params: { slug: 'savora-restaurant-operations' } }, res);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { message: 'Project not found' });
});

test('a different repository using the legacy slug keeps its public detail', async (t) => {
  t.mock.method(GoogleSheetsRepository.prototype, 'list', async () => ({
    items: [{ id: 'client', slug: 'savora-restaurant-operations', published: true,
      repositoryFullName: 'client/private-platform', title: 'Owner-managed project' }], hasMore: false,
  }));
  const res = response();
  await getPublicProject({ params: { slug: 'savora-restaurant-operations' } }, res);
  assert.equal(res.body.project._id, 'client');
  assert.equal(res.body.project.title, 'Owner-managed project');
});
