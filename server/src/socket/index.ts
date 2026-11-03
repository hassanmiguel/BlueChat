import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'bluechat-secret-key-change-in-production';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

export function setupSocketHandlers(io: SocketServer) {
  // Authentication middleware
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      socket.userId = decoded.userId;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;
    console.log(`User connected: ${userId}`);

    // Update user status to online
    await prisma.user.update({
      where: { id: userId },
      data: { status: 'ONLINE', lastSeen: new Date() },
    });

    // Broadcast status change
    socket.broadcast.emit('user:status', { userId, status: 'ONLINE' });

    // ============ SERVER EVENTS ============
    socket.on('server:join', (serverId: string) => {
      socket.join(`server:${serverId}`);
    });

    socket.on('server:leave', (serverId: string) => {
      socket.leave(`server:${serverId}`);
    });

    // ============ CHANNEL EVENTS ============
    socket.on('channel:join', (channelId: string) => {
      socket.join(channelId);
    });

    socket.on('channel:leave', (channelId: string) => {
      socket.leave(channelId);
    });

    // ============ TYPING EVENTS ============
    socket.on('typing:start', async (channelId: string) => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true },
      });
      if (user) {
        socket.to(channelId).emit('typing:update', {
          channelId,
          userId: user.id,
          username: user.username,
          isTyping: true,
        });
      }
    });

    socket.on('typing:stop', (channelId: string) => {
      socket.to(channelId).emit('typing:update', {
        channelId,
        userId,
        isTyping: false,
      });
    });

    // ============ VOICE EVENTS ============
    socket.on('voice:join', async (channelId: string) => {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true },
      });
      
      socket.join(`voice:${channelId}`);
      
      // Notify others in the voice channel
      socket.to(`voice:${channelId}`).emit('voice:user-joined', {
        channelId,
        user: { id: user?.id, username: user?.username },
      });

      // Send current users in voice channel
      const usersInChannel = Array.from(
        io.sockets.adapter.rooms.get(`voice:${channelId}`) || []
      );
      
      socket.emit('voice:users', {
        channelId,
        users: usersInChannel.map(socketId => {
          const s = io.sockets.sockets.get(socketId) as AuthenticatedSocket;
          return { socketId, userId: s?.userId };
        }),
      });
    });

    socket.on('voice:leave', (channelId: string) => {
      socket.leave(`voice:${channelId}`);
      socket.to(`voice:${channelId}`).emit('voice:user-left', {
        channelId,
        userId,
      });
    });

    socket.on('voice:mute', ({ channelId, isMuted }: { channelId: string; isMuted: boolean }) => {
      socket.to(`voice:${channelId}`).emit('voice:user-muted', {
        channelId,
        userId,
        isMuted,
      });
    });

    socket.on('voice:deafen', ({ channelId, isDeafened }: { channelId: string; isDeafened: boolean }) => {
      socket.to(`voice:${channelId}`).emit('voice:user-deafened', {
        channelId,
        userId,
        isDeafened,
      });
    });

    // ============ PRESENCE EVENTS ============
    socket.on('presence:update', async (status: string) => {
      await prisma.user.update({
        where: { id: userId },
        data: { status: status as any },
      });
      socket.broadcast.emit('user:status', { userId, status });
    });

    // ============ DISCONNECT ============
    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${userId}`);
      
      await prisma.user.update({
        where: { id: userId },
        data: { status: 'OFFLINE', lastSeen: new Date() },
      });

      socket.broadcast.emit('user:status', { userId, status: 'OFFLINE' });
    });
  });
}
