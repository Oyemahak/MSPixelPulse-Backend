import test from 'node:test';
import assert from 'node:assert/strict';
import { providerModelInternals } from './providerModel.js';

test('provider model filter supports Mongo relationship, regex, and date operators', () => {
  const record = { id: 'a', participants: ['u1', 'u2'], title: 'Premium Site', createdAt: '2026-01-02T00:00:00.000Z' };
  assert.equal(providerModelInternals.matchesMongoFilter(record, { participants: 'u1' }), true);
  assert.equal(providerModelInternals.matchesMongoFilter(record, { title: { $regex: 'premium', $options: 'i' } }), true);
  assert.equal(providerModelInternals.matchesMongoFilter(record, { createdAt: { $gte: new Date('2026-01-01') } }), true);
  assert.equal(providerModelInternals.matchesMongoFilter(record, { $or: [{ id: 'b' }, { id: 'a' }] }), true);
});

test('provider model update applies Mongo-style set, push, pull, and increments', () => {
  const updated = providerModelInternals.updateValue({ id: 'a', values: ['x'], count: 1 }, {
    $set: { status: 'active' },
    $push: { values: 'y' },
    $pull: { values: 'x' },
    $inc: { count: 2 },
  });
  assert.deepEqual(updated, { id: 'a', values: ['y'], count: 3, status: 'active' });
});
