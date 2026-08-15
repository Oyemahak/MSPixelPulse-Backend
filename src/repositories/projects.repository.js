// src/repositories/projects.repository.js

import {
  GOOGLE_SHEET_TABS,
  GoogleSheetsRepository,
} from '../google/sheets.js';

import {
  projectMembersRepository,
} from './projectMembers.repository.js';

export class ProjectsRepository {
  constructor() {
    this.google =
      new GoogleSheetsRepository(
        GOOGLE_SHEET_TABS.projects,
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

  async listForUser(
    user,
    options = {},
  ) {
    if (user?.role === 'admin') {
      return this.list(options);
    }

    const userId =
      String(
        user?.id ||
          user?._id ||
          '',
      );

    const memberships =
      await projectMembersRepository.findByUser(
        userId,
        {
          limit: 500,
        },
      );

    const ids =
      memberships.items
        .filter((member) =>
          [
            'client',
            'developer',
            'owner',
          ].includes(
            member.role ||
              user?.role,
          ),
        )
        .map((member) =>
          String(
            member.projectId,
          ),
        );

    return this.list({
      ...options,

      filter: (project) => {
        const projectId =
          String(
            project.id ||
              project._id ||
              '',
          );

        const clientId =
          String(
            project.clientId ||
              project.client ||
              '',
          );

        const developerId =
          String(
            project.developerId ||
              project.developer ||
              '',
          );

        return (
          ids.includes(
            projectId,
          ) ||
          clientId ===
            userId ||
          developerId ===
            userId
        );
      },
    });
  }
}

export const projectsRepository =
  new ProjectsRepository();

export default projectsRepository;