import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma, authenticate, AuthRequest } from '../middleware/auth.js';
import type { Server as SocketServer } from 'socket.io';
import { notifyUser } from '../utils/notifications.js';

export const dmRouter = Router();

const publicUserSelect = {
  id: true, username: true, discriminator: true,
  avatar: true, status: true, customStatus: true,
} as const;

const messageInclude = {
  author: { select: publicUserSelect },
  replyTo: {
    include: {
      author: { select: publicUserSelect },
      reactions: { include: { user: { select: { id: true } } } },
      attachments: true,
    },
  },
  reactions: { include: { user: { select: { id: true } } } },
  attachments: true,
} as const;

const zodError = (error: unknown, res: Response) => {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: error.errors[0]?.message || 'Invalid input' });
  }
  return null;
};

const isParticipant = async (dmId: string, userId: string): Promise<boolean> => {
  const participant = await prisma.directMessageParticipant.findUnique({
    where: { dmId_userId: { dmId, userId } },
    select: { id: true },
  });
  return Boolean(participant);
};

const requireParticipant = async (req: AuthRequest, res: Response, next: any) => {
  if (!(await isParticipant(req.params.id, req.userId!))) {
    return res.status(403).json({ error: 'Not a participant in this conversation' });
  }
  next();
};

const requireOwner = async (req: AuthRequest, res: Response, next: any) => {
  const dm = await prisma.directMessage.findUnique({
    where: { id: req.params.id },
    select: { ownerId: true },
  });
  if (!dm) return res.status(404).json({ error: 'Conversation not found' });
  if (dm.ownerId !== req.userId) {
    return res.status(403).json({ error: 'Only the group owner can manage members' });
  }
  next();
};

const serializeReactions = (reactions: { emoji: string; user: { id: string } }[]) => {
  const grouped = new Map<string, string[]>();
  for (const reaction of reactions) {
    const users = grouped.get(reaction.emoji) || [];
    users.push(reaction.user.id);
    grouped.set(reaction.emoji, users);
  }
  return [...grouped].map(([emoji, userIds]) => ({ emoji, count: userIds.length, userIds }));
};

const serializeMessage = (message: any): any => {
  const { reactions, ...rest } = message;
  return {
    ...rest,
    reactions: serializeReactions(reactions || []),
    replyTo: message.replyTo ? serializeMessage(message.replyTo) : null,
  };
};

const dmPayload = {
  participants: { include: { user: { select: publicUserSelect } } },
  messages: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    include: messageInclude,
  },
} as const;

const serializeDm = (dm: any) => ({
  ...dm,
  messages: (dm.messages || []).map(serializeMessage),
});

const emitToDm = (req: AuthRequest, event: string, dmId: string, payload: unknown) => {
  const io = req.app.get('io');
  io.to(`dm:${dmId}`).emit(event, payload);
};

dmRouter.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const dms = await prisma.directMessage.findMany({
      where: { participants: { some: { userId: req.userId } } },
      include: dmPayload,
      orderBy: { updatedAt: 'desc' },
    });
    res.json(dms.map(serializeDm));
  } catch (error) {
    res.status(500).json({ error: 'Failed to get DMs' });
  }
});

dmRouter.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { userIds, isGroup, name } = z.object({
      userIds: z.array(z.string().min(1)).min(1).max(9),
      isGroup: z.boolean().optional(),
      name: z.string().trim().min(1).max(100).optional(),
    }).parse(req.body);

    const uniqueIds = [...new Set([req.userId!, ...userIds])];
    if (uniqueIds.length < 2) return res.status(400).json({ error: 'A DM needs at least one other user' });

    const targets = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true },
    });
    if (targets.length !== new Set(userIds).size) {
      return res.status(404).json({ error: 'One or more users were not found' });
    }
    const blocked = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: req.userId, blockedId: { in: userIds } },
          { blockerId: { in: userIds }, blockedId: req.userId },
        ],
      },
      select: { id: true },
    });
    if (blocked) return res.status(403).json({ error: 'You cannot message a blocked user' });

    const candidates = await prisma.directMessage.findMany({
      where: {
        isGroup: false,
        participants: { every: { userId: { in: uniqueIds } } },
      },
      include: dmPayload,
    });
    const existing = candidates.find((dm) => dm.participants.length === uniqueIds.length);
    if (existing) return res.json(serializeDm(existing));

    const dm = await prisma.directMessage.create({
      data: {
        isGroup: isGroup ?? uniqueIds.length > 2,
        name,
        ownerId: req.userId,
        participants: { create: uniqueIds.map((userId) => ({ userId })) },
      },
      include: dmPayload,
    });

    res.status(201).json(serializeDm(dm));
  } catch (error) {
    if (zodError(error, res)) return;
    res.status(500).json({ error: 'Failed to create DM' });
  }
});

dmRouter.patch('/:id', authenticate, requireParticipant, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, avatar } = z.object({
      name: z.string().trim().min(1).max(100).optional(),
      description: z.string().trim().max(500).optional(),
      avatar: z.string().max(2048).optional(),
    }).parse(req.body);
    const dm = await prisma.directMessage.update({
      where: { id: req.params.id },
      data: { name, description, avatar },
      include: dmPayload,
    });
    emitToDm(req, 'dm:updated', dm.id, { dmId: dm.id, name: dm.name, description: dm.description, avatar: dm.avatar });
    res.json(serializeDm(dm));
  } catch (error) {
    if (zodError(error, res)) return;
    res.status(500).json({ error: 'Failed to update conversation' });
  }
});

dmRouter.post('/:id/participants', authenticate, requireParticipant, requireOwner, async (req: AuthRequest, res: Response) => {
  try {
    const { userIds } = z.object({ userIds: z.array(z.string().min(1)).min(1).max(9) }).parse(req.body);
    const dm = await prisma.directMessage.findUnique({
      where: { id: req.params.id },
      include: { participants: true },
    });
    if (!dm) return res.status(404).json({ error: 'Conversation not found' });
    if (dm.participants.length + userIds.length > 10) {
      return res.status(400).json({ error: 'A group can have at most 10 members' });
    }
    const existingIds = new Set(dm.participants.map((p) => p.userId));
    const newIds = [...new Set(userIds)].filter((id) => !existingIds.has(id));
    if (!newIds.length) return res.status(400).json({ error: 'Those users are already in the group' });
    const users = await prisma.user.findMany({ where: { id: { in: newIds } }, select: { id: true } });
    if (users.length !== newIds.length) return res.status(404).json({ error: 'One or more users were not found' });

    await prisma.directMessageParticipant.createMany({
      data: newIds.map((userId) => ({ dmId: dm.id, userId })),
    });
    const updated = await prisma.directMessage.findUnique({ where: { id: dm.id }, include: dmPayload });
    emitToDm(req, 'dm:participants', dm.id, {
      dmId: dm.id,
      participants: updated?.participants.map((p) => p.userId) || [],
    });
    res.json(serializeDm(updated));
  } catch (error) {
    if (zodError(error, res)) return;
    res.status(500).json({ error: 'Failed to add participants' });
  }
});

dmRouter.delete('/:id/participants/:userId', authenticate, requireParticipant, async (req: AuthRequest, res: Response) => {
  try {
    const dm = await prisma.directMessage.findUnique({
      where: { id: req.params.id },
      select: { ownerId: true, participants: true },
    });
    if (!dm) return res.status(404).json({ error: 'Conversation not found' });
    if (dm.ownerId !== req.userId && req.params.userId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to remove this member' });
    }
    if (req.params.userId === req.userId && dm.ownerId === req.userId) {
      return res.status(400).json({ error: 'Transfer ownership before leaving' });
    }
    await prisma.directMessageParticipant.delete({
      where: { dmId_userId: { dmId: req.params.id, userId: req.params.userId } },
    });
    emitToDm(req, 'dm:participants', req.params.id, { dmId: req.params.id, removedUserId: req.params.userId });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove participant' });
  }
});

dmRouter.post('/:id/owner', authenticate, requireParticipant, requireOwner, async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = z.object({ userId: z.string().min(1) }).parse(req.body);
    if (!(await isParticipant(req.params.id, userId))) {
      return res.status(400).json({ error: 'That user is not in this group' });
    }
    const dm = await prisma.directMessage.update({
      where: { id: req.params.id },
      data: { ownerId: userId },
      include: dmPayload,
    });
    emitToDm(req, 'dm:updated', dm.id, { dmId: dm.id, ownerId: userId });
    res.json(serializeDm(dm));
  } catch (error) {
    if (zodError(error, res)) return;
    res.status(500).json({ error: 'Failed to transfer ownership' });
  }
});

const requireDmMessageParticipant = async (req: AuthRequest, res: Response, next: any) => {
  const message = await prisma.directMessageMessage.findUnique({
    where: { id: req.params.id },
    select: { authorId: true, dmId: true },
  });
  if (!message) return res.status(404).json({ error: 'Message not found' });
  if (!(await isParticipant(message.dmId, req.userId!))) {
    return res.status(403).json({ error: 'Not a participant in this conversation' });
  }
  (req as any).dmMessage = message;
  next();
};

dmRouter.patch('/messages/:id', authenticate, requireDmMessageParticipant, async (req: AuthRequest, res: Response) => {
  try {
    const message = (req as any).dmMessage as { authorId: string; dmId: string };
    if (message.authorId !== req.userId) return res.status(403).json({ error: 'You can only edit your own messages' });
    const { content } = z.object({ content: z.string().trim().min(1).max(4000) }).parse(req.body);
    const updated = await prisma.directMessageMessage.update({
      where: { id: req.params.id },
      data: { content, editedAt: new Date() },
      include: messageInclude,
    });
    const payload = serializeMessage(updated);
    emitToDm(req, 'dm:message:edit', updated.dmId, { dmId: updated.dmId, messageId: updated.id, message: payload });
    res.json(payload);
  } catch (error) {
    if (zodError(error, res)) return;
    res.status(500).json({ error: 'Failed to edit DM' });
  }
});

dmRouter.delete('/messages/:id', authenticate, requireDmMessageParticipant, async (req: AuthRequest, res: Response) => {
  try {
    const message = (req as any).dmMessage as { authorId: string; dmId: string };
    if (message.authorId !== req.userId) return res.status(403).json({ error: 'You can only delete your own messages' });
    const deleted = await prisma.directMessageMessage.delete({ where: { id: req.params.id } });
    emitToDm(req, 'dm:message:delete', deleted.dmId, { dmId: deleted.dmId, messageId: deleted.id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete DM' });
  }
});

dmRouter.post('/messages/:id/reactions', authenticate, requireDmMessageParticipant, async (req: AuthRequest, res: Response) => {
  try {
    const { emoji } = z.object({ emoji: z.string().trim().min(1).max(32) }).parse(req.body);
    const message = (req as any).dmMessage as { dmId: string };
    const existing = await prisma.dmReaction.findUnique({
      where: { messageId_userId_emoji: { messageId: req.params.id, userId: req.userId!, emoji } },
      select: { id: true },
    });
    if (existing) {
      await prisma.dmReaction.delete({ where: { id: existing.id } });
    } else {
      await prisma.dmReaction.create({
        data: { messageId: req.params.id, userId: req.userId!, emoji },
      });
    }
    emitToDm(req, 'dm:message:reaction', message.dmId, {
      dmId: message.dmId,
      messageId: req.params.id,
      userId: req.userId,
      emoji,
      action: existing ? 'remove' : 'add',
    });
    res.json({ success: true });
  } catch (error) {
    if (zodError(error, res)) return;
    res.status(500).json({ error: 'Failed to toggle reaction' });
  }
});

dmRouter.post('/messages/:id/pin', authenticate, requireDmMessageParticipant, async (req: AuthRequest, res: Response) => {
  try {
    const message = (req as any).dmMessage as { dmId: string };
    const current = await prisma.directMessageMessage.findUnique({
      where: { id: req.params.id },
      select: { isPinned: true },
    });
    const updated = await prisma.directMessageMessage.update({
      where: { id: req.params.id },
      data: { isPinned: !current?.isPinned },
    });
    emitToDm(req, 'dm:message:pin', message.dmId, {
      dmId: message.dmId,
      messageId: req.params.id,
      isPinned: updated.isPinned,
    });
    res.json({ success: true, isPinned: updated.isPinned });
  } catch (error) {
    res.status(500).json({ error: 'Failed to pin message' });
  }
});

dmRouter.get('/:id/messages', authenticate, requireParticipant, async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit as string, 10) || 50, 1), 100);
    const messages = await prisma.directMessageMessage.findMany({
      where: { dmId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: messageInclude,
    });
    await prisma.directMessageParticipant.update({
      where: { dmId_userId: { dmId: req.params.id, userId: req.userId! } },
      data: { lastReadAt: new Date() },
    });
    res.json(messages.reverse().map(serializeMessage));
  } catch (error) {
    res.status(500).json({ error: 'Failed to get DM messages' });
  }
});

dmRouter.post('/:id/messages', authenticate, requireParticipant, async (req: AuthRequest, res: Response) => {
  try {
    const { content, replyToId, attachments } = z.object({
      content: z.string().trim().min(1).max(4000),
      replyToId: z.string().optional(),
      attachments: z.array(z.object({
        url: z.string().max(2048),
        filename: z.string().max(255),
        mimeType: z.string().max(100),
        size: z.number().int().min(0).max(25 * 1024 * 1024),
      })).max(10).optional(),
    }).parse(req.body);

    const privateUploadIds = (attachments || []).map((file) => file.url.match(new RegExp('/api/upload/private/([A-Za-z0-9-]+)
      const reply = await prisma.directMessageMessage.findUnique({
        where: { id: replyToId },
        select: { dmId: true },
      });
      if (!reply || reply.dmId !== req.params.id) {
        return res.status(400).json({ error: 'Reply must be in the same conversation' });
      }
    }

    const message = await prisma.directMessageMessage.create({
      data: {
        content,
        dmId: req.params.id,
        authorId: req.userId!,
        replyToId,
        attachments: {
          create: (attachments || []).map((file) => ({
            url: file.url,
            filename: file.filename,
            mimeType: file.mimeType,
            size: file.size,
          })),
        },
      },
      include: messageInclude,
    });
    await prisma.directMessage.update({
      where: { id: req.params.id },
      data: { updatedAt: new Date() },
    });

    const payload = serializeMessage(message);
    emitToDm(req, 'dm:message:new', req.params.id, { dmId: req.params.id, message: payload });

    const io = req.app.get('io') as SocketServer | undefined;
    const participants = await prisma.directMessageParticipant.findMany({
      where: { dmId: req.params.id, userId: { not: req.userId } },
      select: { userId: true },
    });
    for (const participant of participants) {
      await notifyUser(io, {
        userId: participant.userId,
        type: 'direct_message',
        title: message.author.username,
        body: content.slice(0, 160),
        link: `/?dm=${req.params.id}`,
        metadata: { actorId: req.userId },
      });
    }

    res.status(201).json(payload);
  } catch (error) {
    if (zodError(error, res)) return;
    res.status(500).json({ error: 'Failed to send DM' });
  }
});

dmRouter.get('/:id/search', authenticate, requireParticipant, async (req: AuthRequest, res: Response) => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query) return res.json([]);
    const messages = await prisma.directMessageMessage.findMany({
      where: {
        dmId: req.params.id,
        content: { contains: query, mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: messageInclude,
    });
    res.json(messages.reverse().map(serializeMessage));
  } catch (error) {
    res.status(500).json({ error: 'Failed to search conversation' });
  }
});

dmRouter.post('/:id/read', authenticate, requireParticipant, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.directMessageParticipant.update({
      where: { dmId_userId: { dmId: req.params.id, userId: req.userId! } },
      data: { lastReadAt: new Date() },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update read state' });
  }
});
))?.[1]).filter((id): id is string => Boolean(id));
    if (privateUploadIds.length) {
      const ownedUploads = await prisma.privateUpload.findMany({
        where: { id: { in: privateUploadIds }, ownerId: req.userId! },
        select: { id: true },
      });
      if (ownedUploads.length !== new Set(privateUploadIds).size) return res.status(400).json({ error: 'One or more private attachments are invalid or not owned by you' });
    }

    if (replyToId) {
      const reply = await prisma.directMessageMessage.findUnique({
        where: { id: replyToId },
        select: { dmId: true },
      });
      if (!reply || reply.dmId !== req.params.id) {
        return res.status(400).json({ error: 'Reply must be in the same conversation' });
      }
    }

    const message = await prisma.directMessageMessage.create({
      data: {
        content,
        dmId: req.params.id,
        authorId: req.userId!,
        replyToId,
        attachments: {
          create: (attachments || []).map((file) => ({
            url: file.url,
            filename: file.filename,
            mimeType: file.mimeType,
            size: file.size,
          })),
        },
      },
      include: messageInclude,
    });
    await prisma.directMessage.update({
      where: { id: req.params.id },
      data: { updatedAt: new Date() },
    });

    const payload = serializeMessage(message);
    emitToDm(req, 'dm:message:new', req.params.id, { dmId: req.params.id, message: payload });

    const io = req.app.get('io') as SocketServer | undefined;
    const participants = await prisma.directMessageParticipant.findMany({
      where: { dmId: req.params.id, userId: { not: req.userId } },
      select: { userId: true },
    });
    for (const participant of participants) {
      await notifyUser(io, {
        userId: participant.userId,
        type: 'direct_message',
        title: message.author.username,
        body: content.slice(0, 160),
        link: `/?dm=${req.params.id}`,
        metadata: { actorId: req.userId },
      });
    }

    res.status(201).json(payload);
  } catch (error) {
    if (zodError(error, res)) return;
    res.status(500).json({ error: 'Failed to send DM' });
  }
});

dmRouter.get('/:id/search', authenticate, requireParticipant, async (req: AuthRequest, res: Response) => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query) return res.json([]);
    const messages = await prisma.directMessageMessage.findMany({
      where: {
        dmId: req.params.id,
        content: { contains: query, mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: messageInclude,
    });
    res.json(messages.reverse().map(serializeMessage));
  } catch (error) {
    res.status(500).json({ error: 'Failed to search conversation' });
  }
});

dmRouter.post('/:id/read', authenticate, requireParticipant, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.directMessageParticipant.update({
      where: { dmId_userId: { dmId: req.params.id, userId: req.userId! } },
      data: { lastReadAt: new Date() },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update read state' });
  }
});
