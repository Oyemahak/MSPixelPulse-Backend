// backend/src/server.js
import 'dotenv/config';
import connectDB from './config/db.js';
import app from './app.js';
import http from 'http';
import { Server } from 'socket.io';
import { sanitizeErrorCategory } from './config/env.js';
import jwt from 'jsonwebtoken';
import User from './models/User.js';
import Project from './models/Project.js';
import Room from './models/Room.js';
import Thread from './models/Thread.js';
import { jwtSecret } from './utils/jwt.js';
import { corsOptions } from './config/cors.js';
import { canReadProject } from './lib/projectAccess.js';
import { isPortalAccountActive } from './lib/accountPolicy.js';

const PORT = process.env.PORT || 4000;

async function boot() {
  await connectDB();

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: corsOptions,
  });
  app.set('io', io);

  io.use(async (socket, next) => {
    try {
      const authHeader = socket.handshake.headers?.authorization || '';
      const token = socket.handshake.auth?.token || (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '');
      if (!token) return next(new Error('unauthorized'));
      const payload = jwt.verify(token, jwtSecret());
      const user = await User.findById(payload.id || payload.sub)
        .select('_id name email role status accountStatus accessApplication +authVersion');
      if (
        !isPortalAccountActive(user) ||
        Number(payload.ver || 0) !== Number(user.authVersion || 0)
      ) {
        return next(new Error('unauthorized'));
      }
      socket.user = user;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('room:join', async (projectId, done = () => {}) => {
      try {
        const project = await Project.findById(projectId).select('_id client developer').lean();
        if (!canReadProject(socket.user, project)) {
          return done({ ok: false, error: "You don't have access to this project." });
        }
        const room = await Room.findOne({ project: project._id }).select('_id').lean();
        if (!room) return done({ ok: false, error: 'room not found' });
        socket.join(`room:${room._id}`);
        return done({ ok: true });
      } catch {
        return done({ ok: false, error: 'request failed' });
      }
    });

    socket.on('thread:join', async (threadId, done = () => {}) => {
      try {
        const thread = await Thread.findById(threadId).select('participants').lean();
        if (!thread?.participants?.map(String).includes(String(socket.user._id))) {
          return done({ ok: false, error: 'forbidden' });
        }
        socket.join(`thread:${thread._id}`);
        return done({ ok: true });
      } catch {
        return done({ ok: false, error: 'request failed' });
      }
    });
  });

  server.listen(PORT, () => {
    console.log(`API ready on port ${PORT}`);
  });
}

boot().catch((err) => {
  console.error('Fatal boot error:', err.safeCategory || sanitizeErrorCategory(err));
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', sanitizeErrorCategory(err));
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', sanitizeErrorCategory(err));
  process.exit(1);
});
