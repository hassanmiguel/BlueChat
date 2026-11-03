import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

import { authRouter } from './routes/auth.js';
import { serverRouter } from './routes/servers.js';
import { channelRouter } from './routes/channels.js';
import { messageRouter } from './routes/messages.js';
import { dmRouter } from './routes/dms.js';
import { friendRouter } from './routes/friends.js';
import { setupSocketHandlers } from './socket/index.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new SocketServer(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  },
});

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests, please try again later' },
});
app.use('/api/', limiter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/servers', serverRouter);
app.use('/api/channels', channelRouter);
app.use('/api/messages', messageRouter);
app.use('/api/dms', dmRouter);
app.use('/api/friends', friendRouter);

// Socket.io
setupSocketHandlers(io);

// Make io accessible to routes
app.set('io', io);

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// Start server
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🚀 blueChat server running on port ${PORT}`);
  console.log(`📡 Socket.io ready`);
  console.log(`🌐 API: http://localhost:${PORT}/api`);
});

export { io };
