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
  normalizeEmail,
  isPrimarySuperAdminEmail,
  safeAdminUser,
} =
  adminControllerInternals;

function withSuperAdminEmail(
  value,
  callback,
) {
  const previous =
    process.env.SUPER_ADMIN_EMAIL;

  process.env.SUPER_ADMIN_EMAIL =
    value;

  try {
    return callback();
  } finally {
    if (
      previous === undefined
    ) {
      delete process.env
        .SUPER_ADMIN_EMAIL;
    } else {
      process.env
        .SUPER_ADMIN_EMAIL =
        previous;
    }
  }
}

test(
  'admin account protection never treats string false as protected',
  () => {
    assert.equal(
      strictBoolean(false),
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
        email:
          'normal@example.com',

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
  'explicit protection flags remain supported',
  () => {
    assert.equal(
      isProtectedAccount({
        email:
          'normal@example.com',

        isSuperAdmin:
          true,

        isProtected:
          false,
      }),
      true,
    );

    assert.equal(
      isProtectedAccount({
        email:
          'normal@example.com',

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
  'Mahak primary email is protected regardless of stored flags',
  () => {
    withSuperAdminEmail(
      'mahakpateluiux@gmail.com',
      () => {
        assert.equal(
          isProtectedAccount({
            email:
              'mahakpateluiux@gmail.com',

            isSuperAdmin:
              false,

            isProtected:
              false,
          }),
          true,
        );

        assert.equal(
          isPrimarySuperAdminEmail(
            'MAHAKPATELUIUX@GMAIL.COM',
          ),
          true,
        );
      },
    );
  },
);

test(
  'ordinary admin remains manageable',
  () => {
    withSuperAdminEmail(
      'mahakpateluiux@gmail.com',
      () => {
        assert.equal(
          isProtectedAccount({
            email:
              'other.admin@example.com',

            role:
              'admin',

            isSuperAdmin:
              false,

            isProtected:
              false,
          }),
          false,
        );
      },
    );
  },
);

test(
  'unchanged protected email in identity form is safe',
  () => {
    const user = {
      role:
        'admin',

      status:
        'active',

      email:
        'mahakpateluiux@gmail.com',
    };

    assert.equal(
      protectedAccountMutation(
        user,
        {
          name:
            'Updated Name',

          email:
            'mahakpateluiux@gmail.com',
        },
      ),
      false,
    );
  },
);

test(
  'changing protected role status or email is destructive',
  () => {
    const user = {
      role:
        'admin',

      status:
        'active',

      email:
        'mahakpateluiux@gmail.com',
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

test(
  'admin email normalization is stable',
  () => {
    assert.equal(
      normalizeEmail(
        ' MAHAKPATELUIUX@GMAIL.COM ',
      ),
      'mahakpateluiux@gmail.com',
    );
  },
);

test(
  'safe admin presentation forces primary owner protection flags',
  () => {
    withSuperAdminEmail(
      'mahakpateluiux@gmail.com',
      () => {
        const result =
          safeAdminUser({
            id:
              'owner-1',

            email:
              'mahakpateluiux@gmail.com',

            role:
              'admin',

            status:
              'active',

            isSuperAdmin:
              false,

            isProtected:
              false,
          });

        assert.equal(
          result.isSuperAdmin,
          true,
        );

        assert.equal(
          result.isProtected,
          true,
        );
      },
    );
  },
);