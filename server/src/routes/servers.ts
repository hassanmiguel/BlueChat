import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma, authenticate, AuthRequest } from '../middleware/auth.js';

export const serverRouter = Router();

// GET /api/servers - Get user's servers
serverRouter.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const servers = await prisma.server.findMany({
      where: {
        members: { some: { userId: req.userId } },
      },
      include: {
        channels: { orderBy: { position: 'asc' } },
        roles: { orderBy: { position: 'asc' } },
        members: {
          include: {
            user: {
              select: {
                id: true, username: true, discriminator: true,
                avatar: true, status: true, customStatus: true,
              },
            },
            roles: { include: { role: true } },
          },
        },
      },
    });

    res.json(servers);
  } catch (error) {
    console.error('Get servers error:', error);
    res.status(500).json({ error: 'Failed to get servers' });
  }
});

// POST /api/servers - Create a server
serverRouter.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { name, icon } = z.object({
      name: z.string().min(1).max(100),
      icon: z.string().optional(),
    }).parse(req.body);

    const server = await prisma.server.create({
      data: {
        name,
        icon,
        ownerId: req.userId!,
        members: {
          create: { userId: req.userId! },
        },
        roles: {
          create: [
            { name: 'Admin', color: '#da373c', permissions: ['*'], position: 1 },
            { name: 'Member', color: '#949ba4', permissions: [], position: 0 },
          ],
        },
        categories: {
          create: [
            { name: 'Text Channels', position: 0 },
            { name: 'Voice Channels', position: 1 },
          ],
        },
      },
      include: {
        channels: true,
        roles: true,
        members: {
          include: {
            user: {
              select: {
                id: true, username: true, discriminator: true,
                avatar: true, status: true, customStatus: true,
              },
            },
          },
        },
      },
    });

    // Create default channels
    const categories = await prisma.category.findMany({ where: { serverId: server.id } });
    const textCat = categories.find(c => c.name === 'Text Channels');
    const voiceCat = categories.find(c => c.name === 'Voice Channels');

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

    // Fetch full server with channels
    const fullServer = await prisma.server.findUnique({
      where: { id: server.id },
      include: {
        channels: { orderBy: { position: 'asc' } },
        roles: { orderBy: { position: 'asc' } },
        members: {
          include: {
            user: {
              select: {
                id: true, username: true, discriminator: true,
                avatar: true, status: true, customStatus: true,
              },
            },
          },
        },
      },
    });

    res.status(201).json(fullServer);
  } catch (error) {
    console.error('Create server error:', error);
    res.status(500).json({ error: 'Failed to create server' });
  }
});

// GET /api/servers/:id
serverRouter.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const server = await prisma.server.findUnique({
      where: { id: req.params.id },
      include: {
        channels: { orderBy: { position: 'asc' } },
        roles: { orderBy: { position: 'asc' } },
        members: {
          include: {
            user: {
              select: {
                id: true, username: true, discriminator: true,
                avatar: true, status: true, customStatus: true,
              },
            },
          },
        },
      },
    });

    if (!server) return res.status(404).json({ error: 'Server not found' });
    res.json(server);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get server' });
  }
});

// PATCH /api/servers/:id
serverRouter.patch('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { name, icon, banner, description } = req.body;

    const server = await prisma.server.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(icon !== undefined && { icon }),
        ...(banner !== undefined && { banner }),
        ...(description !== undefined && { description }),
      },
    });

    res.json(server);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update server' });
  }
});

// DELETE /api/servers/:id
serverRouter.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
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
    const { inviteCode } = z.object({ inviteCode: z.string() }).parse(req.body);

    const server = await prisma.server.findUnique({
      where: { inviteCode },
      include: {
        channels: { orderBy: { position: 'asc' } },
        roles: { orderBy: { position: 'asc' } },
        members: {
          include: {
            user: {
              select: {
                id: true, username: true, discriminator: true,
                avatar: true, status: true, customStatus: true,
              },
            },
          },
        },
      },
    });

    if (!server) return res.status(404).json({ error: 'Invalid invite code' });

    // Check if already a member
    const existingMember = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: req.userId!, serverId: server.id } },
    });

    if (existingMember) return res.json(server);

    // Join server
    await prisma.serverMember.create({
      data: { userId: req.userId!, serverId: server.id },
    });

    res.json(server);
  } catch (error) {
    res.status(500).json({ error: 'Failed to join server' });
  }
});

// POST /api/servers/:id/leave
serverRouter.post('/:id/leave', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.serverMember.delete({
      where: { userId_serverId: { userId: req.userId!, serverId: req.params.id } },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to leave server' });
  }
});

// GET /api/servers/:id/roles
serverRouter.get('/:id/roles', authenticate, async (req: AuthRequest, res: Response) => {
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
serverRouter.post('/:id/roles', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { name, color, permissions } = req.body;
    const role = await prisma.role.create({
      data: { name, color: color || '#949ba4', permissions: permissions || [], serverId: req.params.id },
    });
    res.status(201).json(role);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create role' });
  }
});

// GET /api/servers/:id/audit-log
serverRouter.get('/:id/audit-log', authenticate, async (req: AuthRequest, res: Response) => {
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
