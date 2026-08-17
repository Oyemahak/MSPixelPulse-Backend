// src/lib/accountPolicy.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SUPER_ADMIN_EMAIL,
  accountAccessState,
  activeAccountPatch,
  isPrimarySuperAdminEmail,
  isProtectedAccount,
  protectedAccountMutation,
  strictBoolean,
} from './accountPolicy.js';

function withSuperAdminEmail(
  value,
  callback,
) {
  const previous =
    process.env.SUPER_ADMIN_EMAIL;

  if (value === undefined) {
    delete process.env
      .SUPER_ADMIN_EMAIL;
  } else {
    process.env
      .SUPER_ADMIN_EMAIL =
      value;
  }

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
  'default primary super admin email is Mahak Patel account',
  () => {
    withSuperAdminEmail(
      undefined,
      () => {
        assert.equal(
          isPrimarySuperAdminEmail(
            DEFAULT_SUPER_ADMIN_EMAIL,
          ),
          true,
        );
      },
    );
  },
);

test(
  'primary super admin email matching is case insensitive',
  () => {
    withSuperAdminEmail(
      'mahakpateluiux@gmail.com',
      () => {
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
  'primary super admin stays protected even when sheet flags are false',
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
      },
    );
  },
);

test(
  'ordinary admin is not protected automatically',
  () => {
    withSuperAdminEmail(
      'mahakpateluiux@gmail.com',
      () => {
        assert.equal(
          isProtectedAccount({
            email:
              'another.admin@example.com',

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
  'string false never counts as protected',
  () => {
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
  },
);

test(
  'safe name update is allowed for protected account',
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
            'Mahak Patel Updated',

          email:
            'mahakpateluiux@gmail.com',
        },
      ),
      false,
    );
  },
);

test(
  'demoting protected account is destructive',
  () => {
    assert.equal(
      protectedAccountMutation(
        {
          role:
            'admin',

          status:
            'active',

          email:
            'mahakpateluiux@gmail.com',
        },
        {
          role:
            'client',
        },
      ),
      true,
    );
  },
);

test(
  'suspending protected account is destructive',
  () => {
    assert.equal(
      protectedAccountMutation(
        {
          role:
            'admin',

          status:
            'active',

          email:
            'mahakpateluiux@gmail.com',
        },
        {
          status:
            'suspended',
        },
      ),
      true,
    );
  },
);

test(
  'changing protected account email is destructive',
  () => {
    assert.equal(
      protectedAccountMutation(
        {
          role:
            'admin',

          status:
            'active',

          email:
            'mahakpateluiux@gmail.com',
        },
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
  'active portal account remains allowed',
  () => {
    assert.deepEqual(
      accountAccessState({
        role:
          'admin',

        status:
          'active',

        accountStatus:
          'active',
      }),
      {
        allowed:
          true,

        reason:
          'active',
      },
    );
  },
);

test(
  'active client patch approves application',
  () => {
    const patch =
      activeAccountPatch(
        {
          role:
            'client',

          accessApplication: {
            status:
              'pending',
          },
        },
        'admin-id',
      );

    assert.equal(
      patch.status,
      'active',
    );

    assert.equal(
      patch.accountStatus,
      'active',
    );

    assert.equal(
      patch.accessApplication
        .status,
      'approved',
    );

    assert.equal(
      patch.accessApplication
        .decidedBy,
      'admin-id',
    );
  },
);