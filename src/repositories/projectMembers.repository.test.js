import test from 'node:test';
import assert from 'node:assert/strict';
import { projectMemberId } from './projectMembers.repository.js';

test('project membership has a durable relationship identifier independent of Sheet rows', () => {
  assert.equal(
    projectMemberId('507f1f77bcf86cd799439011', '507f191e810c19729de860ea', 'client'),
    '507f1f77bcf86cd799439011:507f191e810c19729de860ea:client',
  );
});

