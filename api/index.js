// api/index.js

import app from '../src/app.js';

import {
  dataProviderName,
  storageProviderName,
} from '../src/config/providers.js';

/**
 * Vercel-compatible Express entrypoint.
 *
 * Production persistence:
 * - Google Sheets = application database
 * - Google Drive = file storage
 *
 * There is intentionally no database connection bootstrap here.
 * Google APIs are initialized lazily by their repositories/providers.
 *
 * Socket.IO is handled only by src/server.js for environments that
 * support persistent HTTP connections. Vercel Functions use this
 * stateless Express entrypoint.
 */
export default async function handler(req, res) {
  /*
   * Fail fast if production is ever configured with an unsupported
   * legacy provider.
   */
  const dataProvider = dataProviderName();
  const storageProvider = storageProviderName();

  if (
    dataProvider !== 'google' ||
    storageProvider !== 'google-drive'
  ) {
    return res.status(503).json({
      success: false,
      error: 'PROVIDER_CONFIGURATION_ERROR',
      message:
        'MSPixelPulse requires Google Sheets and Google Drive providers.',
    });
  }

  return app(req, res);
}