// src/server.js

import 'dotenv/config';

import http from 'http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';

import app from './app.js';

import User from './models/User.js';
import Project from './models/Project.js';
import Room from './models/Room.js';
import Thread from './models/Thread.js';

import { sanitizeErrorCategory } from './config/env.js';
import { corsOptions } from './config/cors.js';
import { jwtSecret } from './utils/jwt.js';
import { canReadProject } from './lib/projectAccess.js';
import { isPortalAccountActive } from './lib/accountPolicy.js';

import {
  dataProviderName,
  storageProviderName,
} from './config/providers.js';

const PORT = Number(process.env.PORT || 4000);

async function boot() {
  /*
   * MSPixelPulse production runtime is Google-only.
   *
   * These calls intentionally fail fast when somebody
   * configures a legacy/unsupported provider.
   */
  const dataProvider = dataProviderName();
  const storageProvider = storageProviderName();

  if (
    dataProvider !== 'google' ||
    storageProvider !== 'google-drive'
  ) {
    throw new Error(
      'MSPixelPulse requires Google Sheets and Google Drive providers.',
    );
  }

  const server = http.createServer(app);

  const io = new Server(server, {
    cors: corsOptions,
  });

  app.set('io', io);

  io.use(async (socket, next) => {
    try {
      const authHeader =
        socket.handshake.headers?.authorization || '';

      const token =
        socket.handshake.auth?.token ||
        (
          authHeader.startsWith('Bearer ')
            ? authHeader.slice(7)
            : ''
        );

      if (!token) {
        return next(
          new Error('unauthorized'),
        );
      }

      const payload = jwt.verify(
        token,
        jwtSecret(),
      );

      const user = await User.findById(
        payload.id || payload.sub,
      ).select(
        '_id name email role status accountStatus accessApplication +authVersion',
      );

      if (
        !isPortalAccountActive(user) ||
        Number(payload.ver || 0) !==
          Number(user?.authVersion || 0)
      ) {
        return next(
          new Error('unauthorized'),
        );
      }

      socket.user = user;

      return next();
    } catch {
      return next(
        new Error('unauthorized'),
      );
    }
  });

  io.on('connection', (socket) => {
    socket.on(
      'room:join',
      async (
        projectId,
        done = () => {},
      ) => {
        try {
          const project =
            await Project.findById(
              projectId,
            )
              .select(
                '_id client developer',
              )
              .lean();

          if (
            !project ||
            !canReadProject(
              socket.user,
              project,
            )
          ) {
            return done({
              ok: false,
              error:
                "You don't have access to this project.",
            });
          }

          const room =
            await Room.findOne({
              project:
                project._id,
            })
              .select('_id')
              .lean();

          if (!room) {
            return done({
              ok: false,
              error:
                'room not found',
            });
          }

          socket.join(
            `room:${room._id}`,
          );

          return done({
            ok: true,
          });
        } catch {
          return done({
            ok: false,
            error:
              'request failed',
          });
        }
      },
    );

    socket.on(
      'thread:join',
      async (
        threadId,
        done = () => {},
      ) => {
        try {
          const thread =
            await Thread.findById(
              threadId,
            )
              .select(
                'participants',
              )
              .lean();

          const participantIds =
            (
              thread?.participants ||
              []
            ).map(String);

          if (
            !participantIds.includes(
              String(
                socket.user?._id ||
                  '',
              ),
            )
          ) {
            return done({
              ok: false,
              error:
                'forbidden',
            });
          }

          socket.join(
            `thread:${thread._id}`,
          );

          return done({
            ok: true,
          });
        } catch {
          return done({
            ok: false,
            error:
              'request failed',
          });
        }
      },
    );
  });

  server.listen(
    PORT,
    () => {
      console.log(
        `MSPixelPulse API ready on port ${PORT}`,
      );
    },
  );
}

boot().catch((error) => {
  console.error(
    'Fatal boot error:',
    error?.safeCategory ||
      sanitizeErrorCategory(
        error,
      ),
  );

  process.exit(1);
});

process.on(
  'unhandledRejection',
  (error) => {
    console.error(
      'Unhandled rejection:',
      sanitizeErrorCategory(
        error,
      ),
    );

    process.exit(1);
  },
);

process.on(
  'uncaughtException',
  (error) => {
    console.error(
      'Uncaught exception:',
      sanitizeErrorCategory(
        error,
      ),
    );

    process.exit(1);
  },
);