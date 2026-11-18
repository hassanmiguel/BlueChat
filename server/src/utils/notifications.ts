import type { Server as SocketServer } from 'socket.io';
import { prisma } from '../middleware/auth.js';

export interface NotificationInput {
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

export const notifyUser = async (io: SocketServer | undefined, input: NotificationInput): Promise<void> => {
  if (!io || input.userId === input.metadata?.actorId) return;
  try {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { notificationPrefs: true },
    });
    const prefs = (user?.notificationPrefs || {}) as Record<string, boolean>;
    const prefKey = input.type === 'direct_message' ? 'dmMessages'
      : input.type === 'mention' ? 'mentions'
        : input.type.startsWith('friend') ? 'friendRequests'
          : input.type.includes('call') ? 'calls' : null;
    if (prefKey && prefs[prefKey] === false) return;

    const notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link,
      },
    });
    io.to(`user:${input.userId}`).emit('notification:new', notification);
  } catch (error) {
    console.error('Notification error:', error);
  }
};
