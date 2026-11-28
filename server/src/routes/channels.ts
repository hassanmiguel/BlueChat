import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma, authenticate, AuthRequest } from '../middleware/auth.js';
import type { Server as SocketServer } from 'socket.io';
import { notifyUser } from '../utils/notifications.js';
import {
  isServerMember,
  requireChannelAccess,
  requireChannelManager,
  hasServerPermission,
  hasChannelPermission,
  canViewChannel,
  PERMISSIONS,
} from '../middleware/authz.js';

export const channelRouter = Router();

const publicUserSelect = {
  id: true, username: true, discriminator: true,
  avatar: true, status: true, customStatus: true,
} as const;

const zodError = (error: unknown, res: Response) => {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: error.errors[0]?.message || 'Invalid input' });
  }
  return null;
};

// GET /api/channels/:serverId
channelRouter.get('/:serverId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!(await isServerMember(req.userId!, req.params.serverId))) {
      return res.status(403).json({ error: 'Not a member of this server' });
    }
    const channels = await prisma.channel.findMany({
      where: { serverId: req.params.serverId },
      orderBy: { position: 'asc' },
    });
    const visible = await Promise.all(channels.map(async (channel) =>
      (await canViewChannel(req.userId!, channel.id)) ? channel : null
    ));
    res.json(visible.filter(Boolean));
  } catch (error) {
    res.status(500).json({ error: 'Failed to get channels' });
  }
});

// POST /api/channels
channelRouter.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { serverId, name, type, categoryId, topic } = z.object({
      serverId: z.string().min(1),
      name: z.string().trim().min(1).max(50),
      type: z.enum(['TEXT', 'VOICE', 'ANNOUNCEMENT', 'FORUM', 'STAGE']).default('TEXT'),
      categoryId: z.string().optional(),
      topic: z.string().max(1024).optional(),
    }).parse(req.body);

    if (!(await hasServerPermission(req.userId!, serverId, 'create_channels'))) {
      return res.status(403).json({ error: 'Create Channels permission required' });
    }

    const channel = await prisma.channel.create({
      data: {
        name: name.toLowerCase().replace(/\s+/g, '-'),
        type,
        serverId,
        categoryId,
        topic,
      },
    });
    res.status(201).json(channel);
  } catch (error) {
    if (zodError(error, res)) return;
    res.status(500).json({ error: 'Failed to create channel' });
  }
});

// PATCH /api/channels/:id
channelRouter.patch('/:id', authenticate, requireChannelManager, async (req: AuthRequest, res: Response) => {
  try {
    const updates = z.object({
      name: z.string().trim().min(1).max(50).optional(),
      topic: z.string().max(1024).optional(),
      isNsfw: z.boolean().optional(),
      slowMode: z.number().int().min(0).max(604800).optional(),
      position: z.number().int().min(0).max(10000).optional(),
    }).strict().parse(req.body);

    const channel = await prisma.channel.update({
      where: { id: req.params.id },
      data: updates,
    });
    res.json(channel);
  } catch (error) {
    if (zodError(error, res)) return;
    res.status(500).json({ error: 'Failed to update channel' });
  }
});

// DELETE /api/channels/:id
channelRouter.delete('/:id', authenticate, requireChannelManager, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.channel.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete channel' });
  }
});

// GET /api/channels/:id/messages
channelRouter.get('/:id/messages', authenticate, requireChannelAccess, async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit as string, 10) || 50, 1), 100);
    const beforeRaw = req.query.before as string | undefined;
    const before = beforeRaw && !Number.isNaN(Date.parse(beforeRaw)) ? new Date(beforeRaw) : undefined;

    const messages = await prisma.message.findMany({
      where: {
        channelId: req.params.id,
        deletedAt: null,
        ...(before && { createdAt: { lt: before } }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        author: { select: publicUserSelect },
        reactions: { include: { user: { select: { id: true } } } },
        replyTo: { include: { author: { select: { id: true, username: true } } } },
        attachments: true,
      },
    });

    const transformed = messages.map((msg) => ({
      ...msg,
      reactions: Object.values(
        msg.reactions.reduce((acc: any, r: any) => {
          if (!acc[r.emoji]) acc[r.emoji] = { emoji: r.emoji, count: 0, userIds: [] };
          acc[r.emoji].count += 1;
          acc[r.emoji].userIds.push(r.user.id);
          return acc;
        }, {}),
      ),
    }));

    res.json(transformed.reverse());
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// POST /api/channels/:id/messages
channelRouter.post('/:id/messages', authenticate, requireChannelAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { content, replyTo, attachments } = z.object({
      content: z.string().trim().min(1).max(4000),
      replyTo: z.string().max(64).optional(),
      attachments: z.array(z.object({
        url: z.string().max(2048),
        filename: z.string().max(255),
        mimeType: z.string().max(100),
        size: z.number().int().min(0).max(25 * 1024 * 1024),
      })).max(10).optional(),
    }).parse(req.body);

    const channel = await prisma.channel.findUnique({
      where: { id: req.params.id },
      select: {
        slowMode: true,
        serverId: true,
        server: { select: { autoModEnabled: true, blockedWords: true } },
      },
    });
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    if (channel.server.autoModEnabled) {
      const blocked = channel.server.blockedWords.find((word) => word && content.toLowerCase().includes(word.toLowerCase()));
      if (blocked) return res.status(400).json({ error: 'Message contains a blocked word' });
    }
    if (!(await hasChannelPermission(req.userId!, req.params.id, 'send_messages'))) {
      return res.status(403).json({ error: 'You cannot send messages in this channel' });
    }
    if (attachments?.length && !(await hasChannelPermission(req.userId!, req.params.id, 'attach_files'))) {
      return res.status(403).json({ error: 'You cannot attach files in this channel' });
    }
    const privateUploadIds = (attachments || []).map((file) => file.url.match(new RegExp('/api/upload/private/([A-Za-z0-9-]+)$'))?.[1]).filter((id): id is string => Boolean(id));
    if (privateUploadIds.length) {
      const ownedUploads = await prisma.privateUpload.findMany({
        where: { id: { in: privateUploadIds }, ownerId: req.userId! },
        select: { id: true },
      });
      if (ownedUploads.length !== new Set(privateUploadIds).size) return res.status(400).json({ error: 'One or more private attachments are invalid or not owned by you' });
    }
    if (channel.slowMode) {
      const recent = await prisma.message.findFirst({
        where: {
          channelId: req.params.id,
          authorId: req.userId!,
          createdAt: { gte: new Date(Date.now() - channel.slowMode * 1000) },
        },
        select: { id: true },
      });
      if (recent) return res.status(429).json({ error: `Slow mode is on. Wait ${channel.slowMode}s before sending again.` });
    }

    if (replyTo) {
      const target = await prisma.message.findFirst({
        where: { id: replyTo, channelId: req.params.id, deletedAt: null },
        select: { id: true },
      });
      if (!target) return res.status(400).json({ error: 'Reply target not found in this channel' });
    }

    const message = await prisma.message.create({
      data: {
        content,
        channelId: req.params.id,
        authorId: req.userId!,
        replyToId: replyTo,
        attachments: {
          create: (attachments || []).map((file) => ({
            url: file.url,
            filename: file.filename,
            type: file.mimeType.startsWith('image/') ? 'image'
              : file.mimeType.startsWith('video/') ? 'video'
                : file.mimeType.startsWith('audio/') ? 'audio'
                  : 'file',
            mimeType: file.mimeType,
            size: file.size,
          })),
        },
      },
      include: {
        author: { select: publicUserSelect },
        reactions: { include: { user: { select: { id: true } } } },
        replyTo: { include: { author: { select: { id: true, username: true } } } },
        attachments: true,
      },
    });

    const payload = {
      ...message,
      reactions: Object.values(
        message.reactions.reduce((acc: any, reaction: any) => {
          if (!acc[reaction.emoji]) acc[reaction.emoji] = { emoji: reaction.emoji, count: 0, userIds: [] };
          acc[reaction.emoji].count += 1;
          acc[reaction.emoji].userIds.push(reaction.user.id);
          return acc;
        }, {}),
      ),
    };

    const io = req.app.get('io');
    io.to(req.params.id).emit('message:new', { channelId: req.params.id, message: payload });

    const mentionedNames = [...new Set([...content.matchAll(/@([a-zA-Z0-9_.]+)/g)].map((match) => match[1]))];
    if (mentionedNames.length) {
      const mentionedUsers = await prisma.user.findMany({
        where: { username: { in: mentionedNames } },
        select: { id: true, username: true },
      });
      for (const mentioned of mentionedUsers) {
        await notifyUser(io as SocketServer | undefined, {
          userId: mentioned.id,
          type: 'mention',
          title: `Mentioned by ${message.author.username}`,
          body: content.slice(0, 160),
          link: `/?channel=${req.params.id}`,
          metadata: { actorId: req.userId },
        });
      }
    }

    res.status(201).json(payload);
  } catch (error) {
    if (zodError(error, res)) return;
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// GET /api/channels/:id/search
channelRouter.get('/:id/search', authenticate, requireChannelAccess, async (req: AuthRequest, res: Response) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 200) : '';
    if (!q) return res.json([]);

    const messages = await prisma.message.findMany({
      where: {
        channelId: req.params.id,
        deletedAt: null,
        content: { contains: q, mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: { author: { select: publicUserSelect } },
    });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Failed to search' });
  }
});


// Channel-specific role overrides. Only permissions the actor already holds
// may be granted or denied to another role.
channelRouter.get('/:id/permissions', authenticate, requireChannelManager, async (req: AuthRequest, res: Response) => {
  const overrides = await prisma.channelPermissionOverride.findMany({
    where: { channelId: req.params.id },
    include: { role: { select: { id: true, name: true, position: true } } },
  });
  return res.json(overrides);
});

channelRouter.put('/:id/permissions/:roleId', authenticate, requireChannelManager, async (req: AuthRequest, res: Response) => {
  try {
    const input = z.object({
      allow: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length),
      deny: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length),
    }).strict().parse(req.body);
    const overlap = input.allow.filter((permission) => input.deny.includes(permission));
    if (overlap.length) return res.status(400).json({ error: 'A permission cannot be both allowed and denied' });
    const channel = await prisma.channel.findUnique({ where: { id: req.params.id }, select: { serverId: true } });
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const role = await prisma.role.findFirst({ where: { id: req.params.roleId, serverId: channel.serverId } });
    if (!role) return res.status(404).json({ error: 'Role not found in this server' });
    const requested = [...input.allow, ...input.deny];
    const held = await Promise.all(requested.map((permission) => hasServerPermission(req.userId!, channel.serverId, permission)));
    if (held.some((allowed) => !allowed)) return res.status(403).json({ error: 'You cannot configure permissions you do not possess' });
    const override = await prisma.channelPermissionOverride.upsert({
      where: { channelId_roleId: { channelId: req.params.id, roleId: req.params.roleId } },
      update: input,
      create: { channelId: req.params.id, roleId: req.params.roleId, ...input },
    });
    return res.json(override);
  } catch (error) {
    if (zodError(error, res)) return;
    return res.status(500).json({ error: 'Failed to update channel permissions' });
  }
});

channelRouter.delete('/:id/permissions/:roleId', authenticate, requireChannelManager, async (req: AuthRequest, res: Response) => {
  const result = await prisma.channelPermissionOverride.deleteMany({
    where: { channelId: req.params.id, roleId: req.params.roleId },
  });
  return res.json({ success: result.count === 1 });
});
