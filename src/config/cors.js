// backend/src/config/cors.js
const allowed = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const publicSiteOrigins = new Set([
  'https://mspixelpulse.com',
  'https://www.mspixelpulse.com',
]);

function originMatches(origin, allowedOrigin) {
  if (allowedOrigin === origin) return true;
  if (allowedOrigin.includes('*')) {
    const pattern = '^' + allowedOrigin
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\*/g, '.*') + '$';
    return new RegExp(pattern).test(origin);
  }
  return false;
}

export const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    try {
      const u = new URL(origin);
      const host = u.hostname;

      if (allowed.some((entry) => originMatches(origin, entry))) return cb(null, true);
      if (publicSiteOrigins.has(origin)) return cb(null, true);
      if (host === 'localhost' || host === '127.0.0.1') return cb(null, true);
    } catch (err) {
      console.error('CORS check failed');
    }
    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },

  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Type'],
  optionsSuccessStatus: 204,
  preflightContinue: false,
};
