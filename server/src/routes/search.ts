import { Router, Response } from 'express';
import { authenticate, AuthRequest, prisma } from '../middleware/auth.js';

export const searchRouter = Router();

const userSelect = {
  id: true, username: true, discriminator: true, avatar: true, status: true,
  bio: true, customStatus: true,
} as const;

searchRouter.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 200);
    if (!q) return res.json({ users: [], messages: [], servers: [], channels: [], files: [] });

    const memberServers = await prisma.serverMember.findMany({
      where: { userId: req.userId },
      select: { serverId: true },
    });
    const serverIds = memberServers.map((membership) => membership.serverId);
    const accessibleChannels = await prisma.channel.findMany({
      where: { serverId: { in: serverIds } },
      select: { id: true, name: true, type: true, serverId: true, server: { select: { name: true } } },
    });
    const channelIds = accessibleChannels.map((channel) => channel.id);

    const serverId = String(req.query.serverId || '');
    const channelId = String(req.query.channelId || '');
    const fromUserId = String(req.query.fromUserId || '');
    const before = req.query.before ? new Date(String(req.query.before)) : undefined;
    const after = req.query.after ? new Date(String(req.query.after)) : undefined;
    const hasAttachments = req.query.attachments === 'true';
    const hasImages = req.query.images === 'true';
    const hasLinks = req.query.links === 'true';
    const hasMentions = req.query.mentions === 'true';

    const scopedChannelIds = channelId
      ? channelIds.filter((id) => id === channelId)
      : serverId
        ? accessibleChannels.filter((channel) => channel.serverId === serverId).map((channel) => channel.id)
        : channelIds;

    const messages = scopedChannelIds.length
      ? await prisma.message.findMany({
        where: {
          channelId: { in: scopedChannelIds },
          deletedAt: null,
          content: { contains: q, mode: 'insensitive' },
          ...(fromUserId && { authorId: fromUserId }),
          ...(before && !Number.isNaN(before.getTime()) && { createdAt: { lt: before } }),
          ...(after && !Number.isNaN(after.getTime()) && { createdAt: { gt: after } }),
          ...(hasAttachments && { attachments: { some: {} } }),
          ...(hasImages && { attachments: { some: { mimeType: { startsWith: 'image/' } } } }),
          ...(hasLinks && { content: { contains: 'http' } }),
          ...(hasMentions && { content: { contains: '@' } }),
        },
        include: {
          author: { select: userSelect },
          channel: { select: { id: true, name: true, serverId: true, server: { select: { name: true } } } },
          attachments: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      : [];

    const dmIds = (await prisma.directMessageParticipant.findMany({
      where: { userId: req.userId },
      select: { dmId: true },
    })).map((participant) => participant.dmId);

    const dmMessages = dmIds.length && !serverId && (!channelId || dmIds.includes(channelId))
      ? await prisma.directMessageMessage.findMany({
        where: {
          dmId: { in: dmIds },
          content: { contains: q, mode: 'insensitive' },
          ...(fromUserId && { authorId: fromUserId }),
          ...(before && !Number.isNaN(before.getTime()) && { createdAt: { lt: before } }),
          ...(after && !Number.isNaN(after.getTime()) && { createdAt: { gt: after } }),
          ...(hasAttachments && { attachments: { some: {} } }),
          ...(hasImages && { attachments: { some: { mimeType: { startsWith: 'image/' } } } }),
          ...(hasLinks && { content: { contains: 'http' } }),
          ...(hasMentions && { content: { contains: '@' } }),
        },
        include: {
          author: { select: userSelect },
          dm: { select: { id: true, name: true, isGroup: true } },
          attachments: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      : [];

    const [users, servers, files] = await Promise.all([
      prisma.user.findMany({
        where: {
          id: { not: req.userId },
          OR: [
            { username: { contains: q, mode: 'insensitive' } },
            { bio: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: userSelect,
        take: 25,
      }),
      prisma.server.findMany({
        where: {
          id: { in: serverIds },
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, icon: true, description: true },
        take: 25,
      }),
      scopedChannelIds.length
        ? prisma.attachment.findMany({
          where: {
            filename: { contains: q, mode: 'insensitive' },
            message: { channelId: { in: scopedChannelIds }, deletedAt: null },
          },
          include: { message: { select: { id: true, channelId: true, content: true } } },
          take: 50,
        })
        : Promise.resolve([]),
    ]);

    const channels = accessibleChannels.filter((channel) =>
      channel.name.toLowerCase().includes(q.toLowerCase())
      || channel.server.name.toLowerCase().includes(q.toLowerCase())
    ).slice(0, 25);

    const allMessages = [
      ...messages.map((message) => ({ ...message, isDm: false })),
      ...dmMessages.map((message) => ({
        ...message,
        channelId: message.dmId,
        isDm: true,
        channel: { id: message.dmId, name: message.dm.name || 'Direct message', server: null },
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({ users, messages: allMessages, servers, channels, files });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});
