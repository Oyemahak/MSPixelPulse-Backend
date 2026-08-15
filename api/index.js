import app from '../src/app.js';
import connectDB from '../src/config/db.js';
import { dataProviderName } from '../src/config/providers.js';

let databaseReady;

/**
 * Vercel-compatible Express entrypoint. This handler intentionally has no
 * listen() call; persistent Socket.IO is not part of the Vercel API runtime.
 */
export default async function handler(req, res) {
  if (dataProviderName() === 'mongodb') {
    databaseReady ||= connectDB();
    await databaseReady;
  }
  return app(req, res);
}
