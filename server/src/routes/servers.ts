import { Router, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma, authenticate, AuthRequest } from '../middleware/auth.js';
import {
  requireServerMember,
  requireServerManager,
  requireServerOwner,
  requireServerPermission,
  canManageMember,
  canManageRole,
  PERMISSIONS,
  canViewChannel,
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
    const visibleServers = await Promise.all(servers.map(async (server) => ({
      ...server,
      channels: (await Promise.all(server.channels.map(async (channel) =>
        (await canViewChannel(req.userId!, channel.id)) ? channel : null
      ))).filter(Boolean),
    })));
    res.json(visibleServers);
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
              permissions: ['view_channel', 'read_message_history', 'send_messages', 'attach_files', 'connect', 'speak', 'video', 'screen_share', 'create_threads', 'create_polls', 'send_voice_messages'],
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
    const visibleChannels = await Promise.all(server.channels.map(async (channel) =>
      (await canViewChannel(req.userId!, channel.id)) ? channel : null
    ));
    res.json({ ...server, channels: visibleChannels.filter(Boolean) });
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

    const invite = await prisma.serverInvite.findUnique({ where: { code: inviteCode } });
    const legacyServer = invite ? null : await prisma.server.findUnique({ where: { inviteCode }, select: { id: true } });
    const serverId = invite?.serverId || legacyServer?.id;
    if (!serverId) return res.status(404).json({ error: 'Invalid invite code' });
    if (invite && invite.expiresAt && invite.expiresAt <= new Date()) return res.status(410).json({ error: 'Invite has expired' });
    if (invite && invite.maxUses !== null && invite.uses >= invite.maxUses) return res.status(410).json({ error: 'Invite has reached its use limit' });

    const server = await prisma.server.findUnique({ where: { id: serverId }, include: serverInclude });
    if (!server) return res.status(404).json({ error: 'Server not found' });
    const activeBan = await prisma.ban.findFirst({
      where: { serverId, userId: req.userId!, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    });
    if (activeBan) return res.status(403).json({ error: 'You are banned from this server' });

    const existingMember = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: req.userId!, serverId } },
    });
    if (existingMember) {
      const visibleChannels = await Promise.all(server.channels.map(async (channel) =>
        (await canViewChannel(req.userId!, channel.id)) ? channel : null
      ));
      return res.json({ ...server, channels: visibleChannels.filter(Boolean) });
    }

    try {
      await prisma.$transaction(async (tx) => {
        if (invite) {
          const consumed = await tx.serverInvite.updateMany({
            where: {
              id: invite.id,
              AND: [
                { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
                { OR: [{ maxUses: null }, { uses: { lt: invite.maxUses ?? 0 } }] },
              ],
            },
            data: { uses: { increment: 1 } },
          });
          if (consumed.count !== 1) throw new Error('INVITE_UNAVAILABLE');
        }
        const member = await tx.serverMember.create({ data: { userId: req.userId!, serverId } });
        const defaultRole = await tx.role.findFirst({
          where: { serverId, name: 'Member' },
          orderBy: { position: 'asc' },
          select: { id: true },
        });
        if (defaultRole) {
          await tx.roleMember.create({ data: { roleId: defaultRole.id, memberId: member.id } });
        }
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'INVITE_UNAVAILABLE') return res.status(410).json({ error: 'Invite is no longer available' });
      throw error;
    }
    const joinedServer = await prisma.server.findUnique({ where: { id: serverId }, include: serverInclude });
    if (!joinedServer) return res.status(404).json({ error: 'Server not found' });
    const visibleChannels = await Promise.all(joinedServer.channels.map(async (channel) =>
      (await canViewChannel(req.userId!, channel.id)) ? channel : null
    ));
    res.json({ ...joinedServer, channels: visibleChannels.filter(Boolean) });
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
      permissions: z.array(z.enum(PERMISSIONS)).optional(),
    }).parse(req.body);
    if (permissions?.length) {
      const allowed = await Promise.all(permissions.map((permission) => hasServerPermission(req.userId!, req.params.id, permission)));
      if (allowed.some((value) => !value)) return res.status(403).json({ error: 'You cannot grant permissions you do not possess' });
    }

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
    if (!(await canManageRole(req.userId!, req.params.roleId, req.params.id))) return res.status(403).json({ error: 'You cannot manage a role at or above your highest role' });
    const updates = z.object({
      name: z.string().trim().min(1).max(50).optional(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      permissions: z.array(z.enum(PERMISSIONS)).optional(),
      position: z.number().int().min(0).max(1000).optional(),
    }).strict().parse(req.body);
    if (updates.position !== undefined) {
      const actorRole = await prisma.role.findFirst({
        where: { serverId: req.params.id, members: { some: { member: { is: { userId: req.userId! } } } } },
        orderBy: { position: 'desc' }, select: { position: true },
      });
      const server = await prisma.server.findUnique({ where: { id: req.params.id }, select: { ownerId: true } });
      if (server?.ownerId !== req.userId && (!actorRole || updates.position >= actorRole.position)) return res.status(403).json({ error: 'You cannot move a role to or above your highest role' });
    }
    if (updates.permissions) {
      const allowed = await Promise.all(updates.permissions.map((permission) => hasServerPermission(req.userId!, req.params.id, permission)));
      if (allowed.some((value) => !value)) return res.status(403).json({ error: 'You cannot grant permissions you do not possess' });
    }
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
    if (!(await canManageRole(req.userId!, req.params.roleId, req.params.id))) return res.status(403).json({ error: 'You cannot delete a role at or above your highest role' });
    await prisma.role.delete({ where: { id: req.params.roleId, serverId: req.params.id } });
    await logAudit(req.params.id, req.userId!, 'ROLE_DELETE', req.params.roleId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete role' });
  }
});

serverRouter.post('/:id/roles/:roleId/members/:userId', authenticate, requireServerPermission('manage_roles'), async (req: AuthRequest, res: Response) => {
  try {
    if (!(await canManageRole(req.userId!, req.params.roleId, req.params.id))) return res.status(403).json({ error: 'You cannot assign a role at or above your highest role' });
    if (!(await canManageMember(req.userId!, req.params.userId, req.params.id))) return res.status(403).json({ error: 'You cannot manage this member' });
    const role = await prisma.role.findFirst({ where: { id: req.params.roleId, serverId: req.params.id }, select: { id: true } });
    if (!role) return res.status(404).json({ error: 'Role not found in this server' });
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
    if (!(await canManageRole(req.userId!, req.params.roleId, req.params.id))) return res.status(403).json({ error: 'You cannot remove a role at or above your highest role' });
    if (!(await canManageMember(req.userId!, req.params.userId, req.params.id))) return res.status(403).json({ error: 'You cannot manage this member' });
    const role = await prisma.role.findFirst({ where: { id: req.params.roleId, serverId: req.params.id }, select: { id: true } });
    if (!role) return res.status(404).json({ error: 'Role not found in this server' });
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


// Advanced, expiring, use-limited invite management.
serverRouter.get('/:id/invites', authenticate, requireServerPermission('manage_invites'), async (req: AuthRequest, res: Response) => {
  const invites = await prisma.serverInvite.findMany({
    where: { serverId: req.params.id },
    orderBy: { createdAt: 'desc' },
  });
  return res.json(invites);
});

serverRouter.post('/:id/invites', authenticate, requireServerPermission('manage_invites'), async (req: AuthRequest, res: Response) => {
  try {
    const input = z.object({
      maxUses: z.number().int().min(1).max(100000).optional().nullable(),
      expiresInSeconds: z.number().int().min(60).max(365 * 24 * 60 * 60).optional(),
    }).strict().parse(req.body || {});
    const server = await prisma.server.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!server) return res.status(404).json({ error: 'Server not found' });
    const invite = await prisma.serverInvite.create({
      data: {
        serverId: server.id,
        creatorId: req.userId!,
        code: randomBytes(18).toString('base64url'),
        maxUses: input.maxUses ?? null,
        expiresAt: input.expiresInSeconds ? new Date(Date.now() + input.expiresInSeconds * 1000) : null,
      },
    });
    await logAudit(server.id, req.userId!, 'INVITE_CREATE', invite.id, { maxUses: invite.maxUses, expiresAt: invite.expiresAt });
    return res.status(201).json(invite);
  } catch (error) {
    if (zodError(error, res)) return;
    return res.status(500).json({ error: 'Failed to create invite' });
  }
});

serverRouter.delete('/:id/invites/:inviteId', authenticate, requireServerPermission('manage_invites'), async (req: AuthRequest, res: Response) => {
  const result = await prisma.serverInvite.deleteMany({ where: { id: req.params.inviteId, serverId: req.params.id } });
  if (result.count) await logAudit(req.params.id, req.userId!, 'INVITE_DELETE', req.params.inviteId);
  return res.json({ success: result.count === 1 });
});
