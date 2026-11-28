import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from '../middleware/auth.js';
import { canViewChannel, hasChannelPermission, hasServerPermission, isServerMember } from '../middleware/authz.js';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

/** All live socket ids for a user, so a call can ring every one of their tabs. */
const socketsByUser = new Map<string, Set<string>>();

type CallPhase = 'ringing' | 'accepted' | 'ended';

interface ServerCallState {
  callerId: string;
  calleeId: string;
  phase: CallPhase;
  timer?: ReturnType<typeof setTimeout>;
}

/** Server-side call state stops a stale decline in one tab ending a connected call in another. */
const callStates = new Map<string, ServerCallState>();

export const emitToUser = (io: SocketServer, userId: string, event: string, payload: unknown) => {
  for (const socketId of socketsByUser.get(userId) || []) {
    io.to(socketId).emit(event, payload);
  }
};

const emitToUserExcept = (
  io: SocketServer,
  userId: string,
  exceptSocketId: string,
  event: string,
  payload: unknown,
) => {
  for (const socketId of socketsByUser.get(userId) || []) {
    if (socketId !== exceptSocketId) io.to(socketId).emit(event, payload);
  }
};

const scheduleCallCleanup = (callId: string, state: ServerCallState, delay: number) => {
  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    if (callStates.get(callId) === state) callStates.delete(callId);
  }, delay);
};

const beginCall = (callId: string, callerId: string, calleeId: string) => {
  const existing = callStates.get(callId);
  if (existing && existing.phase !== 'ended') return false;
  if (existing?.timer) clearTimeout(existing.timer);

  const state: ServerCallState = { callerId, calleeId, phase: 'ringing' };
  callStates.set(callId, state);
  scheduleCallCleanup(callId, state, 5 * 60_000);
  return true;
};

const updateCall = (callId: string, phase: Exclude<CallPhase, 'ringing'>) => {
  const state = callStates.get(callId);
  if (!state || state.phase === 'ended') return null;
  if (state.phase === 'accepted' && phase !== 'ended') return null;

  state.phase = phase;
  scheduleCallCleanup(callId, state, 2 * 60_000);
  return state;
};

const parseCookies = (header?: string): Record<string, string> => {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return result;
};

/** Socket.IO does not await async listeners; catch everything so a DB blip cannot kill the server. */
const safe = (handler: (...args: any[]) => unknown) => (...args: any[]) => {
  void Promise.resolve(handler(...args)).catch((error) => {
    console.error('[socket] handler failed:', error);
  });
};

const runDb = (label: string, work: () => Promise<void>) => {
  void work().catch((error) => console.error(`[socket] ${label} failed:`, error));
};

export function setupSocketHandlers(io: SocketServer) {
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const cookies = parseCookies(socket.handshake.headers.cookie);
      const token = socket.handshake.auth.token || cookies[config.cookieName];

      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, config.jwtSecret) as { userId?: unknown; type?: unknown };
      if (decoded.type !== 'access' || typeof decoded.userId !== 'string' || !decoded.userId) {
        return next(new Error('Invalid token'));
      }

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, username: true },
      });
      if (!user) return next(new Error('Invalid token'));

      socket.userId = user.id;
      socket.username = user.username;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;
    const username = socket.username!;

    // Register synchronously: from this moment on, call invites and other
    // socket events can reach this tab, even while DB writes are in flight.
    const userSockets = socketsByUser.get(userId) || new Set<string>();
    const isFirstSocket = userSockets.size === 0;
    userSockets.add(socket.id);
    socketsByUser.set(userId, userSockets);
    socket.join(`user:${userId}`);

    if (isFirstSocket) {
      runDb('presence online', async () => {
        await prisma.user.update({
          where: { id: userId },
          data: { status: 'ONLINE', lastSeen: new Date() },
        });
        socket.broadcast.emit('user:status', { userId, status: 'ONLINE' });
      });
    }

    /** Calls are only allowed between people who share a direct message. */
    const shareDm = async (otherUserId: string, dmId?: string) => {
      if (typeof otherUserId !== 'string' || otherUserId === userId) return false;
      const rows = await prisma.directMessageParticipant.findMany({
        where: { userId: { in: [userId, otherUserId] } },
        select: { dmId: true, userId: true },
      });
      const ids = new Set(rows.map((row) => row.dmId));
      return [...ids].some(
        (id) => rows.some((row) => row.dmId === id && row.userId === userId)
          && rows.some((row) => row.dmId === id && row.userId === otherUserId)
          && (!dmId || id === dmId),
      );
    };

    socket.on('call:invite', safe(async (payload: { callId?: string; toUserId?: string; dmId?: string; type?: string }) => {
      if (!payload || typeof payload.callId !== 'string' || typeof payload.toUserId !== 'string') return;
      if (!['audio', 'video'].includes(payload.type || '')) return;
      if (!(await shareDm(payload.toUserId, payload.dmId))) return;
      if (!beginCall(payload.callId, userId, payload.toUserId)) return;

      emitToUser(io, payload.toUserId, 'call:incoming', {
        callId: payload.callId,
        dmId: payload.dmId,
        type: payload.type,
        from: { id: userId, username },
      });
    }));

    socket.on('call:accept', safe(async (payload: { callId?: string }) => {
      if (!payload || typeof payload.callId !== 'string') return;
      const state = updateCall(payload.callId, 'accepted');
      if (!state || state.calleeId !== userId) return;

      emitToUser(io, state.callerId, 'call:accepted', {
        callId: payload.callId,
        from: { id: userId, username },
      });
      // Other tabs of the callee must stop ringing once one tab answers.
      emitToUserExcept(io, userId, socket.id, 'call:cancelled', { callId: payload.callId });
    }));

    socket.on('call:decline', safe(async (payload: { callId?: string; reason?: string }) => {
      if (!payload || typeof payload.callId !== 'string') return;
      const state = updateCall(payload.callId, 'ended');
      if (!state || state.calleeId !== userId) return;

      emitToUser(io, state.callerId, 'call:declined', {
        callId: payload.callId,
        reason: payload.reason || 'declined',
        from: { id: userId, username },
      });
      emitToUserExcept(io, userId, socket.id, 'call:cancelled', { callId: payload.callId });
    }));

    socket.on('call:offer', safe(async (payload: { callId?: string; sdp?: unknown }) => {
      if (!payload || typeof payload.callId !== 'string' || !payload.sdp) return;
      const state = callStates.get(payload.callId);
      if (!state || state.phase !== 'accepted' || state.callerId !== userId) return;

      emitToUser(io, state.calleeId, 'call:offer', {
        callId: payload.callId,
        sdp: payload.sdp,
        from: { id: userId, username },
      });
    }));

    socket.on('call:answer', safe(async (payload: { callId?: string; sdp?: unknown }) => {
      if (!payload || typeof payload.callId !== 'string' || !payload.sdp) return;
      const state = callStates.get(payload.callId);
      if (!state || state.phase !== 'accepted' || state.calleeId !== userId) return;

      emitToUser(io, state.callerId, 'call:answer', {
        callId: payload.callId,
        sdp: payload.sdp,
        from: { id: userId, username },
      });
    }));

    socket.on('call:ice', safe(async (payload: { callId?: string; candidate?: unknown }) => {
      if (!payload || typeof payload.callId !== 'string' || !payload.candidate) return;
      const state = callStates.get(payload.callId);
      if (!state || state.phase !== 'accepted') return;
      if (userId !== state.callerId && userId !== state.calleeId) return;

      const toUserId = userId === state.callerId ? state.calleeId : state.callerId;
      emitToUser(io, toUserId, 'call:ice', {
        callId: payload.callId,
        candidate: payload.candidate,
        from: { id: userId, username },
      });
    }));

    socket.on('call:end', safe(async (payload: { callId?: string; reason?: string; duration?: number }) => {
      if (!payload || typeof payload.callId !== 'string') return;
      const state = updateCall(payload.callId, 'ended');
      if (!state || (userId !== state.callerId && userId !== state.calleeId)) return;

      const toUserId = userId === state.callerId ? state.calleeId : state.callerId;
      emitToUser(io, toUserId, 'call:ended', {
        callId: payload.callId,
        reason: payload.reason || 'ended',
        duration: payload.duration || 0,
        from: { id: userId, username },
      });
      emitToUserExcept(io, state.calleeId, socket.id, 'call:cancelled', { callId: payload.callId });
    }));

    socket.on('server:join', safe(async (serverId: string) => {
      if (typeof serverId === 'string' && (await isServerMember(userId, serverId))) {
        socket.join(`server:${serverId}`);
      }
    }));

    socket.on('server:leave', (serverId: string) => {
      if (typeof serverId === 'string') socket.leave(`server:${serverId}`);
    });

    socket.on('channel:join', safe(async (channelId: string) => {
      if (typeof channelId !== 'string' || channelId.length > 128) return;
      if (await canViewChannel(userId, channelId)) {
        socket.join(channelId);
      }
    }));

    socket.on('channel:leave', (channelId: string) => {
      if (typeof channelId === 'string') socket.leave(channelId);
    });

    socket.on('dm:join', safe(async (dmId: string) => {
      if (typeof dmId !== 'string') return;
      const participant = await prisma.directMessageParticipant.findUnique({
        where: { dmId_userId: { dmId, userId } },
        select: { id: true },
      });
      if (participant) socket.join(`dm:${dmId}`);
    }));

    const typingRoom = (value: unknown): string | null => {
      if (typeof value !== 'string') return null;
      const room = value.startsWith('dm:') ? value : value;
      return socket.rooms.has(room) ? room : null;
    };

    socket.on('typing:start', (target: string) => {
      const room = typingRoom(target);
      if (!room) return;
      socket.to(room).emit('typing:update', {
        channelId: room,
        userId,
        username,
        isTyping: true,
      });
    });

    socket.on('typing:stop', (target: string) => {
      const room = typingRoom(target);
      if (!room) return;
      socket.to(room).emit('typing:update', {
        channelId: room,
        userId,
        isTyping: false,
      });
    });

    socket.on('voice:join', safe(async (channelId: string) => {
      if (typeof channelId !== 'string') return;
      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        select: { serverId: true, type: true },
      });
      if (!channel || !['VOICE', 'STAGE'].includes(channel.type) || !(await canViewChannel(userId, channelId)) || !(await hasChannelPermission(userId, channelId, 'connect'))) return;

      socket.join(`voice:${channelId}`);
      socket.to(`voice:${channelId}`).emit('voice:user-joined', {
        channelId,
        user: { id: userId, username },
      });

      const sockets = Array.from(io.sockets.adapter.rooms.get(`voice:${channelId}`) || []);
      socket.emit('voice:users', {
        channelId,
        users: sockets.map((socketId) => {
          const member = io.sockets.sockets.get(socketId) as AuthenticatedSocket | undefined;
          return { socketId, userId: member?.userId };
        }),
      });
    }));

    socket.on('voice:leave', (channelId: string) => {
      if (typeof channelId !== 'string' || channelId.length > 64) return;
      const room = `voice:${channelId}`;
      if (!socket.rooms.has(room)) return;
      socket.leave(room);
      socket.to(room).emit('voice:user-left', { channelId, userId });
    });

    socket.on('voice:mute', (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const { channelId, isMuted } = payload as { channelId?: unknown; isMuted?: unknown };
      if (typeof channelId !== 'string' || channelId.length > 64 || typeof isMuted !== 'boolean') return;
      const room = `voice:${channelId}`;
      if (!socket.rooms.has(room)) return;
      socket.to(room).emit('voice:user-muted', { channelId, userId, isMuted });
    });

    socket.on('voice:deafen', (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const { channelId, isDeafened } = payload as { channelId?: unknown; isDeafened?: unknown };
      if (typeof channelId !== 'string' || channelId.length > 64 || typeof isDeafened !== 'boolean') return;
      const room = `voice:${channelId}`;
      if (!socket.rooms.has(room)) return;
      socket.to(room).emit('voice:user-deafened', { channelId, userId, isDeafened });
    });

    socket.on('presence:update', safe(async (status: string) => {
      if (!['ONLINE', 'IDLE', 'DND', 'INVISIBLE'].includes(status)) return;
      await prisma.user.update({ where: { id: userId }, data: { status: status as any } });
      socket.broadcast.emit('user:status', { userId, status });
    }));

    socket.on('disconnect', () => {
      const remaining = socketsByUser.get(userId);
      remaining?.delete(socket.id);
      if (remaining?.size) return;

      socketsByUser.delete(userId);
      runDb('presence offline', async () => {
        await prisma.user.update({
          where: { id: userId },
          data: { status: 'OFFLINE', lastSeen: new Date() },
        });
        io.emit('user:status', { userId, status: 'OFFLINE' });
      });
    });
  });
}
