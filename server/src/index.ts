import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { config } from './config.js';

import { authRouter } from './routes/auth.js';
import { oauthRouter } from './routes/oauth.js';
import { serverRouter } from './routes/servers.js';
import { channelRouter } from './routes/channels.js';
import { messageRouter } from './routes/messages.js';
import { dmRouter } from './routes/dms.js';
import { friendRouter } from './routes/friends.js';
import { userRouter } from './routes/users.js';
import { uploadRouter } from './routes/upload.js';
import { moderationRouter } from './routes/moderation.js';
import { notificationRouter } from './routes/notifications.js';
import { searchRouter } from './routes/search.js';
import { featureRouter } from './routes/features.js';
import { dispatchScheduledMessages } from './workers/scheduledMessages.js';
import { voiceRouter } from './routes/voice.js';
import { verifyCsrf } from './middleware/auth.js';
import { setupSocketHandlers } from './socket/index.js';

const app = express();
const httpServer = createServer(app);
const io = new SocketServer(httpServer, {
  cors: {
    origin: config.clientUrl,
    credentials: true,
  },
});

app.disable('x-powered-by');
app.set('trust proxy', config.trustProxyHops > 0 ? config.trustProxyHops : false);

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(self), camera=(self), display-capture=(self)');
  if (config.isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use(cors({
  origin: config.clientUrl,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Upload-Field'],
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

const apiLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
app.use('/api/', apiLimiter);

const authLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many authentication attempts, please try again later' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/password', authLimiter);
app.use('/api/auth/oauth', authLimiter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/', verifyCsrf);

app.use('/uploads', express.static(path.resolve(process.cwd(), process.env.UPLOAD_DIR || './uploads'), {
  fallthrough: false,
  setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
}));

app.use('/api/auth', authRouter);
app.use('/api/auth/oauth', oauthRouter);
app.use('/api/servers', serverRouter);
app.use('/api/channels', channelRouter);
app.use('/api/messages', messageRouter);
app.use('/api/dms', dmRouter);
app.use('/api/friends', friendRouter);
app.use('/api/users', userRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/moderation', moderationRouter);
app.use('/api/search', searchRouter);
app.use('/api/features', featureRouter);
app.use('/api/voice', voiceRouter);

setupSocketHandlers(io);

// Scheduled-message dispatcher. The database lease prevents overlapping
// dispatch attempts across instances under normal operation.
const scheduledDispatchTimer = setInterval(() => {
  void dispatchScheduledMessages(io).catch((error) => console.error('Scheduled message worker error:', error));
}, 10_000);
scheduledDispatchTimer.unref?.();
app.set('io', io);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: config.isProduction ? 'Internal server error' : err.message || 'Internal server error',
  });
});

httpServer.listen(config.port, () => {
  console.log(`blueChat server running on port ${config.port}`);
  console.log('Socket.io ready');
});

export { io };
