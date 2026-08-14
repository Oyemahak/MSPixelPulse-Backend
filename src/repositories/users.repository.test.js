import test from 'node:test';
import assert from 'node:assert/strict';
import { UsersRepository } from './users.repository.js';

function withGoogleProvider(operation) {
  const previous = process.env.DATA_PROVIDER;
  process.env.DATA_PROVIDER = 'google';
  return Promise.resolve(operation()).finally(() => {
    if (previous === undefined) delete process.env.DATA_PROVIDER;
    else process.env.DATA_PROVIDER = previous;
  });
}

test('Google users repository hashes new passwords and verifies the stored hash', async () => {
  await withGoogleProvider(async () => {
    const repository = new UsersRepository();
    let stored;
    repository.google = {
      create: async (value) => { stored = value; return value; },
      findOne: async () => stored,
    };

    const user = await repository.create({
      id: 'user-a',
      name: 'User A',
      email: 'USER@example.test',
      password: 'password-123',
      role: 'client',
      status: 'active',
      applicationStatus: 'approved',
    });
    assert.equal('password' in stored, false);
    assert.match(stored.passwordHash, /^\$2/);
    assert.equal('password' in user, false);
    assert.equal(Boolean(await repository.verifyCredentials('user@example.test', 'password-123')), true);
    assert.equal(await repository.verifyCredentials('user@example.test', 'wrong'), null);
  });
});

test('Google users repository maps stable Sheet ids into current JWT and account fields', () => {
  const repository = new UsersRepository();
  const user = repository.present({
    id: 'sheet-user-id',
    role: 'client',
    status: 'active',
    applicationStatus: 'approved',
  });
  assert.equal(user._id, 'sheet-user-id');
  assert.equal(user.accountStatus, 'active');
  assert.equal(user.accessApplication.status, 'approved');
});

