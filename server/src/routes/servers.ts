import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma, authenticate, AuthRequest } from '../middleware/auth.js';
import {
  requireServerMember,
  requireServerManager,
  requireServerOwner,
  requireServerPermission,
} from '../middleware/authz.js';
import { logAudit } from '../utils/audit.js';

export const serverRouter = Router();

const publicUserSelect = {
  id: true, username: true, discriminator: true,
  avatar: true, status: true, customStatus: true,
} as const;

const serverInclude = {
  channels: { orderBy: { position: 'asc' as const } },
  roles: { orderBy: { position: 'asc' as const } },
  members: {
    include: {
      user: { select: publicUserSelect },
      roles: { include: { role: true } },
    },
  },
} as const;

const zodError = (error: unknown, res: Response) => {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: error.errors[0]?.message || 'Invalid input' });
  }
  return null;
};

// GET /api/servers
serverRouter.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const servers = await prisma.server.findMany({
      where: { members: { some: { userId: req.userId } } },
      include: serverInclude,
    });
    res.json(servers);
  } catch (error) {
    console.error('Get servers error:', error);
    res.status(500).json({ error: 'Failed to get servers' });
  }
});

// POST /api/servers
serverRouter.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { name, icon } = z.object({
      name: z.string().trim().min(1).max(100),
      icon: z.string().max(2048).optional(),
    }).parse(req.body);

    const server = await prisma.server.create({
      data: {
        name,
        icon,
        ownerId: req.userId!,
        members: { create: { userId: req.userId! } },
        roles: {
          create: [
            { name: 'Admin', color: '#da373c', permissions: ['*'], position: 1 },
            {
              name: 'Member',
              color: '#949ba4',
              permissions: ['send_messages', 'attach_files', 'connect', 'speak', 'video', 'screen_share'],
              position: 0,
            },
          ],
        },
        categories: {
          create: [
            { name: 'Text Channels', position: 0 },
            { name: 'Voice Channels', position: 1 },
          ],
        },
      },
    });

    const categories = await prisma.category.findMany({ where: { serverId: server.id } });
    const textCat = categories.find((c) => c.name === 'Text Channels');
    const voiceCat = categories.find((c) => c.name === 'Voice Channels');

    if (textCat) {
      await prisma.channel.createMany({
        data: [
          { name: 'general', type: 'TEXT', serverId: server.id, categoryId: textCat.id, topic: 'General discussion', position: 0 },
          { name: 'off-topic', type: 'TEXT', serverId: server.id, categoryId: textCat.id, topic: 'Anything goes', position: 1 },
        ],
      });
    }
    if (voiceCat) {
      await prisma.channel.create({
        data: { name: 'General', type: 'VOICE', serverId: server.id, categoryId: voiceCat.id, position: 0 },
      });
    }

    const fullServer = await prisma.server.findUnique({
      where: { id: server.id },
      include: serverInclude,
    });

    res.status(201).json(fullServer);
  } catch (error) {
    if (zodError(error, res)) return;
    console.error('Create server error:', error);
    res.status(500).json({ error: 'Failed to create server' });
  }
});

// GET /api/servers/:id
serverRouter.get('/:id', authenticate, requireServerMember, async (req: AuthRequest, res: Response) => {
  try {
    const server = await prisma.server.findUnique({
      where: { id: req.params.id },
      include: serverInclude,
    });
    if (!server) return res.status(404).json({ error: 'Server not found' });
    res.json(server);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get server' });
  }
});

// PATCH /api/servers/:id
serverRouter.patch('/:id', authenticate, requireServerManager, async (req: AuthRequest, res: Response) => {
  try {
    const updates = z.object({
      name: z.string().trim().min(1).max(100).optional(),
      icon: z.string().max(2048).optional(),
      banner: z.string().max(2048).optional(),
      description: z.string().max(2000).optional(),
    }).strict().parse(req.body);

    const server = await prisma.server.update({
      where: { id: req.params.id },
      data: updates,
    });
    await logAudit(req.params.id, req.userId!, 'SERVER_UPDATE', server.id, updates);
    res.json(server);
  } catch (error) {
    if (zodError(error, res)) return;
    res.status(500).json({ error: 'Failed to update server' });
  }
});

// DELETE /api/servers/:id
serverRouter.delete('/:id', authenticate, requireServerOwner, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.server.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete server' });
  }
});

// POST /api/servers/join
serverRouter.post('/join', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { inviteCode } = z.object({ inviteCode: z.string().trim().min(1).max(128) }).parse(req.body);

    const server = await prisma.server.findUnique({
      where: { inviteCode },
      include: serverInclude,
    });
    if (!server) return res.status(404).json({ error: 'Invalid invite code' });

    const existingMember = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: req.userId!, serverId: server.id } },
    });
    if (existingMember) return res.json(server);

    await prisma.serverMember.create({
      data: { userId: req.userId!, serverId: server.id },
    });

    res.json(server);
  } catch (error) {
    if (zodError(error, res)) return;
    res.status(500).json({ error: 'Failed to join server' });
  }
});

// POST /api/servers/:id/leave
serverRouter.post('/:id/leave', authenticate, requireServerMember, async (req: AuthRequest, res: Response) => {
  try {
    const server = await prisma.server.findUnique({
      where: { id: req.params.id },
      select: { ownerId: true },
    });
    if (server?.ownerId === req.userId) {
      return res.status(400).json({ error: 'Server owners cannot leave their own server' });
    }

    await prisma.serverMember.delete({
      where: { userId_serverId: { userId: req.userId!, serverId: req.params.id } },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to leave server' });
  }
});

// GET /api/servers/:id/roles
serverRouter.get('/:id/roles', authenticate, requireServerMember, async (req: AuthRequest, res: Response) => {
  try {
    const roles = await prisma.role.findMany({
      where: { serverId: req.params.id },
      orderBy: { position: 'asc' },
    });
    res.json(roles);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get roles' });
  }
});

// POST /api/servers/:id/roles
serverRouter.post('/:id/roles', authenticate, requireServerManager, async (req: AuthRequest, res: Response) => {
  try {
    const { name, color, permissions } = z.object({
      name: z.string().trim().min(1).max(50),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      permissions: z.array(z.string().max(64)).optional(),
    }).parse(req.body);

    const role = await prisma.role.create({
      data: {
        name,
        color: color || '#949ba4',
        permissions: permissions || [],
        serverId: req.params.id,
      },
    });
    await logAudit(req.params.id, req.userId!, 'ROLE_CREATE', role.id, { name, permissions });
    res.status(201).json(role);
  } catch (error) {
    if (zodError(error, res)) return;
    res.status(500).json({ error: 'Failed to create role' });
  }
});

serverRouter.patch('/:id/roles/:roleId', authenticate, requireServerPermission('manage_roles'), async (req: AuthRequest, res: Response) => {
  try {
    const updates = z.object({
      name: z.string().trim().min(1).max(50).optional(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      permissions: z.array(z.string().max(64)).optional(),
      position: z.number().int().min(0).max(1000).optional(),
    }).parse(req.body);
    const role = await prisma.role.update({
      where: { id: req.params.roleId, serverId: req.params.id },
      data: updates,
    });
    await logAudit(req.params.id, req.userId!, 'ROLE_UPDATE', role.id, updates);
    res.json(role);
  } catch (error) {
    if (zodError(error, res)) return;
    res.status(500).json({ error: 'Failed to update role' });
  }
});

serverRouter.delete('/:id/roles/:roleId', authenticate, requireServerPermission('manage_roles'), async (req: AuthRequest, res: Response) => {
  try {
    await prisma.role.delete({ where: { id: req.params.roleId, serverId: req.params.id } });
    await logAudit(req.params.id, req.userId!, 'ROLE_DELETE', req.params.roleId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete role' });
  }
});

serverRouter.post('/:id/roles/:roleId/members/:userId', authenticate, requireServerPermission('manage_roles'), async (req: AuthRequest, res: Response) => {
  try {
    const member = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: req.params.userId, serverId: req.params.id } },
      select: { id: true },
    });
    if (!member) return res.status(404).json({ error: 'Member not found' });
    await prisma.roleMember.upsert({
      where: { roleId_memberId: { roleId: req.params.roleId, memberId: member.id } },
      update: {},
      create: { roleId: req.params.roleId, memberId: member.id },
    });
    await logAudit(req.params.id, req.userId!, 'ROLE_UPDATE', req.params.userId, { roleId: req.params.roleId, assigned: true });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to assign role' });
  }
});

serverRouter.delete('/:id/roles/:roleId/members/:userId', authenticate, requireServerPermission('manage_roles'), async (req: AuthRequest, res: Response) => {
  try {
    const member = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: req.params.userId, serverId: req.params.id } },
      select: { id: true },
    });
    if (!member) return res.status(404).json({ error: 'Member not found' });
    await prisma.roleMember.deleteMany({
      where: { roleId: req.params.roleId, memberId: member.id },
    });
    await logAudit(req.params.id, req.userId!, 'ROLE_UPDATE', req.params.userId, { roleId: req.params.roleId, assigned: false });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove role' });
  }
});

// GET /api/servers/:id/audit-log
serverRouter.get('/:id/audit-log', authenticate, requireServerManager, async (req: AuthRequest, res: Response) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: { serverId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { user: { select: { id: true, username: true } } },
    });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get audit log' });
  }
});
