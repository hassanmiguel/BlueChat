import { Router, Response } from 'express';
import { prisma } from '../middleware/auth.js';
import { authenticateBot, BotRequest, requireBotScope } from '../middleware/botAuth.js';

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
