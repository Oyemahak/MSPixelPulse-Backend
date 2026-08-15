// src/lib/health.js

import {
  providerStatus,
} from '../config/providers.js';

import {
  storageProviderStatus,
} from '../storage/provider.js';

import {
  mailerStatus,
} from './mailer.js';

function configured(value) {
  return Boolean(
    String(
      value || '',
    ).trim(),
  );
}

export function healthPayload() {
  const providers =
    providerStatus();

  const storage =
    storageProviderStatus();

  const email =
    mailerStatus();

  return {
    success: true,

    service:
      'mspixelpulse-api',

    environment:
      process.env.NODE_ENV ||
      'development',

    timestamp:
      new Date().toISOString(),

    uptime:
      Math.round(
        process.uptime(),
      ),

    providers,

    database: {
      provider:
        'google-sheets',

      configured:
        configured(
          process.env
            .GOOGLE_DATABASE_SPREADSHEET_ID,
        ),
    },

    storage,

    google: {
      clientConfigured:
        configured(
          process.env
            .GOOGLE_CLIENT_ID,
        ) &&
        configured(
          process.env
            .GOOGLE_CLIENT_SECRET,
        ) &&
        configured(
          process.env
            .GOOGLE_REFRESH_TOKEN,
        ),

      spreadsheetConfigured:
        configured(
          process.env
            .GOOGLE_DATABASE_SPREADSHEET_ID,
        ),

      driveConfigured:
        configured(
          process.env
            .GOOGLE_DRIVE_ROOT_FOLDER_ID,
        ) &&
        configured(
          process.env
            .GOOGLE_DRIVE_CLIENT_FILES_FOLDER_ID,
        ) &&
        configured(
          process.env
            .GOOGLE_DRIVE_PROJECT_FILES_FOLDER_ID,
        ),
    },

    email,
  };
}