import app from '../src/app.js';
import connectDB from '../src/config/db.js';
import { dataProviderName } from '../src/config/providers.js';

let databaseReady;

/**
 * Vercel-compatible Express entrypoint. Render continues to use src/server.js
 * (including Socket.IO); this handler intentionally has no listen() call.
 */
export default async function handler(req, res) {
  if (dataProviderName() === 'mongodb') {
    databaseReady ||= connectDB();
    await databaseReady;
  }
  return app(req, res);
}

