import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma, authenticate, AuthRequest } from '../middleware/auth.js';

export const channelRouter = Router();

// GET /api/channels/:serverId
channelRouter.get('/:serverId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const channels = await prisma.channel.findMany({
      where: { serverId: req.params.serverId },
      orderBy: { position: 'asc' },
    });
    res.json(channels);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get channels' });
  }
});

// POST /api/channels (create channel in server)
channelRouter.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { serverId, name, type, categoryId, topic } = z.object({
      serverId: z.string(),
      name: z.string().min(1),
      type: z.enum(['TEXT', 'VOICE', 'ANNOUNCEMENT', 'FORUM']).default('TEXT'),
      categoryId: z.string().optional(),
      topic: z.string().optional(),
    }).parse(req.body);

    const channel = await prisma.channel.create({
      data: {
        name: name.toLowerCase().replace(/\s+/g, '-'),
        type: type as any,
        serverId,
        categoryId,
        topic,
      },
    });

    res.status(201).json(channel);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create channel' });
  }
});

// PATCH /api/channels/:id
channelRouter.patch('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { name, topic, isNsfw, slowMode, position } = req.body;
    const channel = await prisma.channel.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(topic !== undefined && { topic }),
        ...(isNsfw !== undefined && { isNsfw }),
        ...(slowMode !== undefined && { slowMode }),
        ...(position !== undefined && { position }),
      },
    });
    res.json(channel);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update channel' });
  }
});

// DELETE /api/channels/:id
channelRouter.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.channel.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete channel' });
  }
});

// GET /api/channels/:id/messages
channelRouter.get('/:id/messages', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const before = req.query.before as string;

    const messages = await prisma.message.findMany({
      where: {
        channelId: req.params.id,
        deletedAt: null,
        ...(before && { createdAt: { lt: new Date(before) } }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        author: {
          select: {
            id: true, username: true, discriminator: true,
            avatar: true, status: true, customStatus: true,
          },
        },
        reactions: {
          include: { user: { select: { id: true } } },
        },
        replyTo: {
          include: {
            author: { select: { id: true, username: true } },
          },
        },
        attachments: true,
      },
    });

    // Transform reactions
    const transformed = messages.map(msg => ({
      ...msg,
      reactions: Object.values(
        msg.reactions.reduce((acc: any, r: any) => {
          if (!acc[r.emoji]) acc[r.emoji] = { emoji: r.emoji, count: 0, userIds: [] };
          acc[r.emoji].count++;
          acc[r.emoji].userIds.push(r.user.id);
          return acc;
        }, {})
      ),
    }));

    res.json(transformed.reverse());
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// POST /api/channels/:id/messages
channelRouter.post('/:id/messages', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { content, replyTo } = z.object({
      content: z.string().min(1).max(4000),
      replyTo: z.string().optional(),
    }).parse(req.body);

    const message = await prisma.message.create({
      data: {
        content,
        channelId: req.params.id,
        authorId: req.userId!,
        replyToId: replyTo,
      },
      include: {
        author: {
          select: {
            id: true, username: true, discriminator: true,
            avatar: true, status: true, customStatus: true,
          },
        },
      },
    });

    // Emit socket event
    const io = req.app.get('io');
    io.to(req.params.id).emit('message:new', {
      channelId: req.params.id,
      message,
    });

    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// GET /api/channels/:id/search
channelRouter.get('/:id/search', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const q = req.query.q as string;
    const messages = await prisma.message.findMany({
      where: {
        channelId: req.params.id,
        deletedAt: null,
        content: { contains: q, mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: {
        author: { select: { id: true, username: true, discriminator: true, avatar: true } },
      },
    });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Failed to search' });
  }
});
