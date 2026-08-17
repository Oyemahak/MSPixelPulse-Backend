// src/repositories/users.repository.js

import bcrypt from 'bcryptjs';

import {
  GoogleSheetsRepository,
  GOOGLE_SHEET_TABS,
} from '../google/sheets.js';

export class UsersRepository {
  constructor() {
    this.google =
      new GoogleSheetsRepository(
        GOOGLE_SHEET_TABS.users,
      );
  }

  async findById(
    id,
    {
      fresh = false,
    } = {},
  ) {
    return this.present(
      await this.google.findById(
        id,
        {
          fresh,
        },
      ),
    );
  }

  async list(
    options,
  ) {
    const result =
      await this.google.list(
        options,
      );

    return {
      ...result,

      items:
        result.items.map(
          (item) =>
            this.present(
              item,
            ),
        ),
    };
  }

  async update(
    id,
    patch,
  ) {
    return this.present(
      await this.google.update(
        id,
        patch,
      ),
    );
  }

  async updatePresence(
    id,
    lastSeenAt =
      new Date().toISOString(),
  ) {
    if (!id) {
      return null;
    }

    /*
     * Presence may only update the heartbeat timestamp.
     * Never merge arbitrary request data here.
     */
    return this.present(
      await this.google.update(
        id,
        {
          lastSeenAt:
            String(
              lastSeenAt,
            ),
        },
      ),
    );
  }

  delete(
    id,
  ) {
    return this.google.delete(
      id,
    );
  }

  async findByEmail(
    email,
  ) {
    const normalized =
      String(
        email || '',
      )
        .trim()
        .toLowerCase();

    const user =
      await this.google.findOne(
        {
          email:
            normalized,
        },
        {
          fresh: true,
        },
      );

    return this.present(
      user,
      {
        credentials:
          true,
      },
    );
  }

  async create({
    password,
    passwordHash,
    ...input
  } = {}) {
    const email =
      String(
        input.email || '',
      )
        .trim()
        .toLowerCase();

    const existing =
      await this.google.findOne(
        {
          email,
        },
        {
          fresh: true,
        },
      );

    if (existing) {
      const error =
        new Error(
          'A user with this email already exists',
        );

      error.code =
        'USER_EMAIL_CONFLICT';

      error.status =
        409;

      throw error;
    }

    const hash =
      passwordHash ||
      (
        password
          ? await bcrypt.hash(
              String(
                password,
              ),
              10,
            )
          : ''
      );

    if (!hash) {
      const error =
        new Error(
          'passwordHash is required for a Google user record',
        );

      error.code =
        'PASSWORD_HASH_REQUIRED';

      error.status =
        400;

      throw error;
    }

    const created =
      await this.google.create({
        ...input,

        email,

        passwordHash:
          hash,

        lastSeenAt:
          input.lastSeenAt ||
          '',
      });

    return this.present(
      created,
    );
  }

  async verifyCredentials(
    email,
    password,
  ) {
    const user =
      await this.findByEmail(
        email,
      );

    if (!user) {
      return null;
    }

    const hash =
      user.password;

    if (!hash) {
      return null;
    }

    const valid =
      await bcrypt.compare(
        String(
          password ||
            '',
        ),
        hash,
      );

    if (!valid) {
      return null;
    }

    return user;
  }

  async setPassword(
    id,
    password,
  ) {
    const current =
      await this.google.findById(
        id,
        {
          fresh: true,
        },
      );

    if (!current) {
      return null;
    }

    const nextAuthVersion =
      Number(
        current.authVersion ||
          0,
      ) + 1;

    const updated =
      await this.google.update(
        id,
        {
          passwordHash:
            await bcrypt.hash(
              String(
                password,
              ),
              10,
            ),

          passwordChangedAt:
            new Date()
              .toISOString(),

          authVersion:
            nextAuthVersion,
        },
      );

    return this.present(
      updated,
    );
  }

  present(
    value,
    {
      credentials =
        false,
    } = {},
  ) {
    if (!value) {
      return null;
    }

    const user = {
      ...value,

      _id:
        value._id ||
        value.id,
    };

    if (
      !user.accountStatus &&
      user.status
    ) {
      user.accountStatus =
        user.status;
    }

    if (
      !user.accessApplication &&
      user.applicationStatus
    ) {
      user.accessApplication = {
        status:
          user.applicationStatus,

        requestedRole:
          user.role ||
          'client',
      };
    }

    user.authVersion =
      Number(
        user.authVersion ||
          0,
      );

    user.lastSeenAt =
      String(
        user.lastSeenAt ||
          '',
      );

    if (
      credentials &&
      user.passwordHash
    ) {
      user.password =
        user.passwordHash;
    }

    delete user.passwordHash;

    if (!credentials) {
      delete user.password;
    }

    return user;
  }
}

export const usersRepository =
  new UsersRepository();

export default usersRepository;