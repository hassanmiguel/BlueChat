import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../middleware/auth.js';
import { authenticateBot, BotRequest, requireBotScope } from '../middleware/botAuth.js';
import { hasChannelPermission, hasTimeout, isServerMember } from '../middleware/authz.js';
import { getAutoModViolation } from '../utils/automod.js';

export const botRouter = Router();

botRouter.get('/v1/application', authenticateBot, async (req: BotRequest, res: Response) => {
  const application = await prisma.botApplication.findUnique({
    where: { id: req.botApplicationId! },
    select: { id: true, name: true, description: true, avatar: true, isPublic: true, createdAt: true },
  });
  if (!application) return res.status(404).json({ error: 'Bot application not found' });
  return res.json({ application, scopes: req.botScopes || [] });
});

botRouter.get('/v1/installations', authenticateBot, requireBotScope('read_members'), async (req: BotRequest, res: Response) => {
  const installations = await prisma.botInstallation.findMany({
    where: { applicationId: req.botApplicationId! },
    orderBy: { createdAt: 'desc' },
  });
  const servers = await prisma.server.findMany({
    where: { id: { in: installations.map((item) => item.serverId) } },
    select: { id: true, name: true, icon: true },
  });
  const serverById = new Map(servers.map((server) => [server.id, server]));
  return res.json(installations.map((installation) => ({
    ...installation,
    server: serverById.get(installation.serverId) || null,
  })));
});


botRouter.post('/v1/channels/:channelId/messages', authenticateBot, requireBotScope('send_messages'), async (req: BotRequest, res: Response) => {
  try {
    const { content } = z.object({ content: z.string().trim().min(1).max(4000) }).parse(req.body);
    const channel = await prisma.channel.findUnique({
      where: { id: req.params.channelId },
      select: { id: true, serverId: true, slowMode: true, server: { select: { autoModEnabled: true, blockedWords: true } } },
    });
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const installation = await prisma.botInstallation.findUnique({
      where: { applicationId_serverId: { applicationId: req.botApplicationId!, serverId: channel.serverId } },
    });
    if (!installation || !installation.permissions.includes('send_messages')) return res.status(403).json({ error: 'Bot is not installed with send_messages permission in this server' });
    if (!(await isServerMember(installation.installedById, channel.serverId)) ||
        !(await hasChannelPermission(installation.installedById, channel.id, 'send_messages')) ||
        (await hasTimeout(installation.installedById, channel.serverId))) {
      return res.status(403).json({ error: 'The installing member no longer has permission to post in this channel' });
    }
    if (channel.server.autoModEnabled) {
      const violation = await getAutoModViolation(channel.serverId, channel.id, installation.installedById, content, channel.server.blockedWords);
      if (violation) return res.status(400).json({ error: violation });
    }
    if (channel.slowMode) {
      const recent = await prisma.message.findFirst({
        where: { channelId: channel.id, authorId: installation.installedById, createdAt: { gte: new Date(Date.now() - channel.slowMode * 1000) } },
        select: { id: true },
      });
      if (recent) return res.status(429).json({ error: 'Channel slow mode is active' });
    }

    const message = await prisma.message.create({
      data: { channelId: channel.id, authorId: installation.installedById, botApplicationId: req.botApplicationId!, content },
      include: {
        author: { select: { id: true, username: true, discriminator: true, avatar: true, status: true } },
        botApplication: { select: { id: true, name: true, avatar: true } },
        reactions: true,
        attachments: true,
      },
    });
    req.app.get('io')?.to(channel.id).emit('message:new', { channelId: channel.id, message });
    return res.status(201).json(message);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0]?.message || 'Invalid input' });
    return res.status(500).json({ error: 'Bot message send failed' });
  }
});
