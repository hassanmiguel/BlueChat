import type { Server as SocketServer } from 'socket.io';
import { prisma } from '../middleware/auth.js';
import { hasChannelPermission, hasTimeout, isServerMember } from '../middleware/authz.js';

/**
 * Dispatch due messages with a short database lease so multiple server
 * instances do not normally send the same item concurrently. A stale lease
 * is reclaimable after two minutes if a process exits mid-dispatch.
 */
export const dispatchScheduledMessages = async (io: SocketServer): Promise<void> => {
  const now = new Date();
  const staleLease = new Date(now.getTime() - 2 * 60_000);
  const due = await prisma.scheduledMessage.findMany({
    where: {
      scheduledAt: { lte: now },
      sentAt: null,
      cancelledAt: null,
      OR: [{ processingAt: null }, { processingAt: { lt: staleLease } }],
    },
    orderBy: { scheduledAt: 'asc' },
    take: 25,
  });

  for (const item of due) {
    const claim = await prisma.scheduledMessage.updateMany({
      where: {
        id: item.id,
        sentAt: null,
        cancelledAt: null,
        OR: [{ processingAt: null }, { processingAt: { lt: staleLease } }],
      },
      data: { processingAt: now },
    });
    if (claim.count !== 1) continue;

    try {
      const channel = await prisma.channel.findUnique({
        where: { id: item.channelId },
        select: { id: true, serverId: true, slowMode: true, server: { select: { autoModEnabled: true, blockedWords: true } } },
      });
      if (!channel || !(await isServerMember(item.authorId, channel.serverId)) ||
          !(await hasChannelPermission(item.authorId, channel.id, 'send_messages')) ||
          (await hasTimeout(item.authorId, channel.serverId))) {
        await prisma.scheduledMessage.update({
          where: { id: item.id },
          data: { cancelledAt: new Date(), processingAt: null },
        });
        continue;
      }

      if (channel.slowMode) {
        const recent = await prisma.message.findFirst({
          where: { channelId: channel.id, authorId: item.authorId, createdAt: { gte: new Date(Date.now() - channel.slowMode * 1000) } },
          select: { id: true },
        });
        if (recent) {
          await prisma.scheduledMessage.update({ where: { id: item.id }, data: { processingAt: null, scheduledAt: new Date(Date.now() + channel.slowMode * 1000) } });
          continue;
        }
      }

      if (channel.server.autoModEnabled && channel.server.blockedWords.some((word) =>
        word && item.content.toLocaleLowerCase().includes(word.toLocaleLowerCase()))) {
        await prisma.scheduledMessage.update({
          where: { id: item.id },
          data: { cancelledAt: new Date(), processingAt: null },
        });
        continue;
      }

      const message = await prisma.$transaction(async (tx) => {
        const created = await tx.message.create({
          data: { channelId: channel.id, authorId: item.authorId, content: item.content },
          include: { author: { select: { id: true, username: true, discriminator: true, avatar: true, status: true } }, attachments: true, reactions: true },
        });
        await tx.scheduledMessage.update({
          where: { id: item.id },
          data: { sentAt: new Date(), processingAt: null },
        });
        return created;
      });
      io.to(channel.id).emit('message:new', { channelId: channel.id, message });
    } catch (error) {
      // Release the lease for retry. The two-minute stale lease also recovers
      // a process crash between message creation and sentAt persistence.
      await prisma.scheduledMessage.updateMany({
        where: { id: item.id, sentAt: null, cancelledAt: null },
        data: { processingAt: null },
      });
      console.error('Scheduled message dispatch failed:', item.id, error);
    }
  }
};
