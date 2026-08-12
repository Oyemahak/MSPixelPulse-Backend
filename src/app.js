// backend/src/app.js
import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { corsOptions } from './config/cors.js';
import apiRouter from './routes/index.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { healthPayload } from './lib/health.js';

const app = express();

// Render terminates TLS one proxy hop before the Node service. Trust exactly
// that hop so express-rate-limit can safely resolve the visitor IP from
// X-Forwarded-For without accepting an arbitrary forwarded chain.
app.set('trust proxy', 1);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ───────────────────────────────────────────────
// CORS first (reads from corsOptions in config/cors.js)
// ───────────────────────────────────────────────
app.use(cors(corsOptions));

// Body & cookies
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many authentication requests. Please try again later.' },
});
app.use('/api/auth', authLimiter);

// Dev logs (optional in production)
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// ───────────────────────────────────────────────
// Root info
// ───────────────────────────────────────────────
app.get('/', (_req, res) => {
  res
    .type('text')
    .send('MSPixelPulse API is running. Try /health or /api/* endpoints.');
});

// ───────────────────────────────────────────────
// Health checks for both base and /api paths
// ───────────────────────────────────────────────
app.get('/health', (_req, res) => res.json(healthPayload()));

// ✅ IMPORTANT: add this one so frontend wake pings pass
app.get('/api/health', (_req, res) => res.json(healthPayload()));

// ───────────────────────────────────────────────
// All API routes (includes /auth, /contact, etc.)
// ───────────────────────────────────────────────
app.use('/api', apiRouter);

// ───────────────────────────────────────────────
// Error handlers
// ───────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

export default app;
