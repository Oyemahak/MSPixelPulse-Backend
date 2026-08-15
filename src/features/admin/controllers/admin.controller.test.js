// src/features/admin/controllers/admin.controller.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  adminControllerInternals,
} from './admin.controller.js';

const {
  strictBoolean,
  isProtectedAccount,
  protectedAccountMutation,
} =
  adminControllerInternals;

test(
  'admin account protection never treats the string false as protected',
  () => {
    assert.equal(
      strictBoolean(
        false,
      ),
      false,
    );

    assert.equal(
      strictBoolean(
        'false',
      ),
      false,
    );

    assert.equal(
      strictBoolean(
        'FALSE',
      ),
      false,
    );

    assert.equal(
      isProtectedAccount({
        isSuperAdmin:
          'false',

        isProtected:
          'false',
      }),
      false,
    );
  },
);

test(
  'admin account protection recognizes explicit true values',
  () => {
    assert.equal(
      isProtectedAccount({
        isSuperAdmin:
          true,

        isProtected:
          false,
      }),
      true,
    );

    assert.equal(
      isProtectedAccount({
        isSuperAdmin:
          'true',

        isProtected:
          'false',
      }),
      true,
    );
  },
);

test(
  'unchanged protected email in identity form does not count as destructive mutation',
  () => {
    const user = {
      role: 'admin',
      status: 'active',
      email:
        'admin@example.com',
    };

    assert.equal(
      protectedAccountMutation(
        user,
        {
          name:
            'Updated Name',

          email:
            'admin@example.com',
        },
      ),
      false,
    );
  },
);

test(
  'changing role status or email of protected account is detected',
  () => {
    const user = {
      role: 'admin',
      status: 'active',
      email:
        'admin@example.com',
    };

    assert.equal(
      protectedAccountMutation(
        user,
        {
          role:
            'client',
        },
      ),
      true,
    );

    assert.equal(
      protectedAccountMutation(
        user,
        {
          status:
            'suspended',
        },
      ),
      true,
    );

    assert.equal(
      protectedAccountMutation(
        user,
        {
          email:
            'other@example.com',
        },
      ),
      true,
    );
  },
);