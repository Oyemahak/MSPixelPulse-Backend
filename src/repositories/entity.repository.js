// src/repositories/entity.repository.js

import {
  GoogleSheetsRepository,
} from '../google/sheets.js';

/**
 * Google Sheets entity repository.
 *
 * Stable application IDs are used instead of spreadsheet row numbers.
 * Mongoose models may still exist as controller/schema compatibility
 * façades, but persistent data is stored in Google Sheets.
 */
export class EntityRepository {
  constructor({
    tab,
    idField = 'id',
  }) {
    this.tab = tab;
    this.idField =
      idField;

    this.google =
      new GoogleSheetsRepository(
        tab,
        {
          idField,
        },
      );
  }

  findById(id, options) {
    return this.google.findById(
      id,
      options,
    );
  }

  findOne(filter, options) {
    return this.google.findOne(
      filter,
      options,
    );
  }

  list(options) {
    return this.google.list(
      options,
    );
  }

  create(input) {
    return this.google.create(
      input,
    );
  }

  update(id, patch) {
    return this.google.update(
      id,
      patch,
    );
  }

  delete(id) {
    return this.google.delete(
      id,
    );
  }

  findByEmail(
    email,
    options,
  ) {
    return this.findOne(
      {
        email:
          String(
            email || '',
          )
            .trim()
            .toLowerCase(),
      },
      options,
    );
  }

  findByProject(
    projectId,
    options = {},
  ) {
    return this.list({
      ...options,

      filter: {
        ...(options.filter ||
          {}),

        projectId:
          String(projectId),
      },
    });
  }

  findByUser(
    userId,
    options = {},
  ) {
    return this.list({
      ...options,

      filter: {
        ...(options.filter ||
          {}),

        userId:
          String(userId),
      },
    });
  }
}

export function createEntityRepository(
  config,
) {
  return new EntityRepository(
    config,
  );
}