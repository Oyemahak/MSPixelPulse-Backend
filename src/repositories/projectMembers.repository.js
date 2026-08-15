// src/repositories/projectMembers.repository.js

import crypto from 'crypto';

import {
  GOOGLE_SHEET_TABS,
  GoogleSheetsRepository,
} from '../google/sheets.js';

export function projectMemberId(
  projectId,
  userId,
  role = 'member',
) {
  return `${String(
    projectId,
  )}:${String(
    userId,
  )}:${String(role)}`;
}

export class ProjectMembersRepository {
  constructor() {
    this.google =
      new GoogleSheetsRepository(
        GOOGLE_SHEET_TABS.projectMembers,
      );
  }

  findByUser(
    userId,
    {
      page = 1,
      limit = 100,
    } = {},
  ) {
    return this.google.list({
      filter: {
        userId:
          String(userId),
      },

      page,
      limit,
    });
  }

  findByProject(
    projectId,
    {
      page = 1,
      limit = 100,
    } = {},
  ) {
    return this.google.list({
      filter: {
        projectId:
          String(projectId),
      },

      page,
      limit,
    });
  }

  async upsert({
    id,
    projectId,
    userId,
    role = 'member',
    ...input
  }) {
    const memberId =
      id ||
      projectMemberId(
        projectId,
        userId,
        role,
      ) ||
      crypto.randomUUID();

    const existing =
      await this.google.findById(
        memberId,
      );

    const value = {
      id: memberId,

      projectId:
        String(projectId),

      userId:
        String(userId),

      role,

      ...input,
    };

    return existing
      ? this.google.update(
          memberId,
          value,
        )
      : this.google.create(
          value,
        );
  }

  delete(id) {
    return this.google.delete(
      id,
    );
  }
}

export const projectMembersRepository =
  new ProjectMembersRepository();

export default projectMembersRepository;